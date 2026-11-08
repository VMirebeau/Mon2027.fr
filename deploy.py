#!/usr/bin/env python3
"""
Mon2027 Deployment Script (Docker + nginx container sur un VPS)
================================================================

Usage:
    python deploy.py              # Menu interactif
    python deploy.py player       # Upload sources player + rebuild image + restart
    python deploy.py admin        # Idem pour l'espace contributeurs (mon2027.fr/admin)
    python deploy.py all          # compose + player + admin
    python deploy.py compose      # Upload docker-compose.yml + Dockerfiles + .env build args
    python deploy.py env          # Upload player/.env et admin/.env (env runtime)
    python deploy.py nginx        # Upload conf nginx mon2027 + reload du container prod_nginx
    python deploy.py content      # Envoie le contenu local en prod, par FUSION (conflits signales)
    python deploy.py pull         # Recupere le contenu de prod dans prisma/dev.db
    python deploy.py migrate      # prisma migrate deploy sur la prod.db (sauvegarde avant)
    python deploy.py backup       # Rapatrie une copie de prod.db dans backups/ (local)
    python deploy.py backup-cron  # Installe la sauvegarde quotidienne sur le serveur (14 jours)
    python deploy.py contributor  # Comptes contributeurs (ex. : contributor create <login> superadmin <nom>)
    python deploy.py status       # docker compose ps
    python deploy.py logs         # Logs d'un service
    python deploy.py restart      # Restart player + admin
    python deploy.py cert         # Emet/renouvelle le cert Let's Encrypt pour mon2027.fr
    python deploy.py init         # Provisionnement initial VPS (1ere fois)

La PROD fait reference pour le contenu : les contributeurs y travaillent
(mon2027.fr/admin). Toi, tu peux aussi preparer du contenu en local (batchs,
admin sur localhost:2027) puis l'envoyer avec `content`, qui ne remplace que
ce que personne n'a modifie en prod depuis ton dernier `pull`/`content`.
"""

import json
import os
import shlex
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SSH_HOST = os.environ.get("MON2027_SSH_HOST", "mon-serveur")  # alias SSH (~/.ssh/config)
REMOTE_DIR = "/opt/docker/mon2027"
NGINX_CONF_DIR = "/opt/docker/nginx/conf.d"
CERTBOT_CONF_VOL = "docker_certbot-conf"
CERTBOT_WWW_VOL = "docker_certbot-www"
DB_VOLUME = "mon2027_db"
PLAYER_CONTAINER = "prod_mon2027_player"
COMPOSE_CMD = f"cd {REMOTE_DIR} && sudo docker compose"
LOCAL_PATH = Path(__file__).parent.resolve()
DOMAIN = "mon2027.fr"
CERT_EMAIL = os.environ.get("MON2027_CERT_EMAIL", "admin@example.org")  # contact Let's Encrypt


class C:
    HEADER = "\033[95m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    END = "\033[0m"
    BOLD = "\033[1m"


def header(t):
    print(f"\n{C.HEADER}{C.BOLD}{'=' * 60}{C.END}\n{C.HEADER}{C.BOLD}  {t}{C.END}\n{C.HEADER}{C.BOLD}{'=' * 60}{C.END}\n")


def step(t):
    print(f"{C.CYAN}>>> {t}{C.END}")


def ok(t):
    print(f"{C.GREEN}[OK] {t}{C.END}")


def err(t):
    print(f"{C.RED}[ERR] {t}{C.END}")


def warn(t):
    print(f"{C.YELLOW}[!] {t}{C.END}")


def run_local(cmd, cwd=None, check=True, env=None):
    step(f"Local: {cmd}")
    env_full = os.environ.copy()
    if env:
        env_full.update(env)
    result = subprocess.run(cmd, shell=True, cwd=cwd or LOCAL_PATH, env=env_full)
    if check and result.returncode != 0:
        err(f"Echec (code {result.returncode})")
        sys.exit(1)
    return result


def run_remote(cmd, check=True):
    step(f"Remote: {cmd}")
    result = subprocess.run(f'ssh {SSH_HOST} "{cmd}"', shell=True)
    if check and result.returncode != 0:
        err(f"Echec remote (code {result.returncode})")
        sys.exit(1)
    return result


def run_remote_capture(cmd):
    result = subprocess.run(
        f'ssh {SSH_HOST} "{cmd}"',
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode, (result.stdout or "") + (result.stderr or "")


def scp_upload(local, remote):
    step(f"SCP: {local} -> {remote}")
    result = subprocess.run(f'scp "{local}" {SSH_HOST}:{remote}', shell=True)
    if result.returncode != 0:
        err("Upload echoue")
        sys.exit(1)


def scp_upload_dir(local, remote):
    step(f"SCP -r: {local} -> {remote}")
    run_remote(f"mkdir -p {remote}", check=False)
    result = subprocess.run(f'scp -r "{local}/." {SSH_HOST}:{remote}/', shell=True)
    if result.returncode != 0:
        err("Upload echoue")
        sys.exit(1)


def to_cygwin_path(p):
    p = str(p).replace("\\", "/")
    if len(p) >= 2 and p[1] == ":":
        p = f"/cygdrive/{p[0].lower()}{p[2:]}"
    return p


_RSYNC_CFG = None


def _rsync_config():
    global _RSYNC_CFG
    if _RSYNC_CFG is not None:
        return _RSYNC_CFG
    cwrsync = Path.home() / "scoop" / "apps" / "cwrsync" / "current" / "bin"
    if (cwrsync / "rsync.exe").exists() and (cwrsync / "ssh.exe").exists():
        _RSYNC_CFG = {
            "available": True,
            "bin": str(cwrsync),
            "rsync": str(cwrsync / "rsync.exe"),
            "ssh": str(cwrsync / "ssh.exe"),
        }
    else:
        r = subprocess.run("rsync --version", shell=True, capture_output=True)
        if r.returncode == 0:
            _RSYNC_CFG = {"available": True, "bin": None, "rsync": "rsync", "ssh": "ssh"}
        else:
            _RSYNC_CFG = {"available": False}
            warn("rsync non dispo - fallback scp")
    return _RSYNC_CFG


def sync_upload(local, remote, exclude=None):
    """rsync -avz --delete avec fallback scp si rsync absent. Cree le dossier
    distant au besoin. L'arg local est traite comme un dossier (sans / final)."""
    cfg = _rsync_config()
    local = str(local).rstrip("/\\")
    if cfg["available"]:
        env = os.environ.copy()
        if cfg["bin"]:
            env["PATH"] = cfg["bin"] + ";" + env.get("PATH", "")
        excludes = [f"--exclude={e}" for e in (exclude or [])]
        cygwin_src = to_cygwin_path(local)
        run_remote(f"mkdir -p {remote}", check=False)
        cmd = [
            cfg["rsync"], "-avz", "--delete", "-e", cfg["ssh"], *excludes,
            f"{cygwin_src}/", f"{SSH_HOST}:{remote}/",
        ]
        step(f"Rsync: {local}/ -> {remote}/")
        r = subprocess.run(cmd, env=env)
        if r.returncode != 0:
            err("rsync echoue")
            sys.exit(1)
    else:
        scp_upload_dir(local, remote)


# ============================================================
# DEPLOIEMENTS APPS
# ============================================================

# Excludes communs : node_modules + build + DB locale + .env (les .env
# runtime sont uploades separement via upload_env_runtime).
APP_EXCLUDES = [
    "node_modules", ".next", "dev.db*", ".env", ".env.local",
    "tsconfig.tsbuildinfo", "*.log",
]


def deploy_app(app):
    """Upload des sources d'une app (player | admin), rebuild de son image,
    redemarrage, puis verification depuis l'exterieur."""
    service = f"mon2027-{app}"
    header(f"DEPLOIEMENT {app.upper()}")

    step(f"Upload sources {app}")
    sync_upload(LOCAL_PATH / app, f"{REMOTE_DIR}/{app}", exclude=APP_EXCLUDES)
    # Schema Prisma partage a la racine (../prisma vu depuis l'app) : le
    # builder Docker en a besoin.
    sync_upload(LOCAL_PATH / "prisma", f"{REMOTE_DIR}/prisma", exclude=["dev.db*", "content-base.json"])
    scp_upload(str(LOCAL_PATH / "package.json"), f"{REMOTE_DIR}/package.json")
    scp_upload(str(LOCAL_PATH / "package-lock.json"), f"{REMOTE_DIR}/package-lock.json")

    step(f"Rebuild image {service}")
    run_remote(f"{COMPOSE_CMD} build {service}")

    step("Restart container")
    run_remote(f"{COMPOSE_CMD} up -d {service}")

    # Filet de securite : le container recree peut changer d'IP. La conf
    # nginx actuelle re-resout a chaque requete (resolver Docker), mais une
    # ancienne conf avec le nom en dur garderait l'IP perimee -> 502 sur tout
    # le site (incident du 2026-11-07). Un reload gracieux re-resout.
    reload_nginx()

    step("Statut")
    run_remote(f"{COMPOSE_CMD} ps")
    check_site("/api/me" if app == "player" else "/admin/login")
    ok(f"{app.capitalize()} deploye -> https://{DOMAIN}{'' if app == 'player' else '/admin'}")


def deploy_player():
    deploy_app("player")


def deploy_admin():
    deploy_app("admin")


def reload_nginx():
    step("nginx -t puis reload")
    rc, out = run_remote_capture("sudo docker exec prod_nginx nginx -t && sudo docker exec prod_nginx nginx -s reload")
    if rc != 0:
        print(out)
        warn("Reload nginx impossible (conf invalide ?) : verifier avant de continuer.")


def check_site(path="/api/me"):
    """Verifie que le site repond vraiment, vu de l'exterieur. Quelques essais
    le temps que Next demarre."""
    import time
    import urllib.request

    url = f"https://{DOMAIN}{path}"
    last = None
    for _ in range(6):
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                if r.status == 200:
                    ok(f"{url} repond 200")
                    return
                last = f"HTTP {r.status}"
        except Exception as e:  # noqa: BLE001 — on veut juste un diagnostic
            last = e
        time.sleep(5)
    err(f"{url} ne repond pas correctement ({last}). Le site est peut-etre en panne :")
    err("verifier `python deploy.py logs` et `python deploy.py status`.")


def deploy_all():
    header("DEPLOIEMENT COMPLET")
    upload_compose()
    deploy_player()
    deploy_admin()
    ok("Tout deploye")


# ============================================================
# COMPOSE & ENV
# ============================================================

def upload_compose():
    header("UPLOAD compose + Dockerfiles + build args")

    step("Upload docker-compose.yml")
    scp_upload(str(LOCAL_PATH / "docker-compose.yml"), f"{REMOTE_DIR}/docker-compose.yml")

    step("Upload Dockerfiles")
    scp_upload(str(LOCAL_PATH / "Dockerfile.player"), f"{REMOTE_DIR}/Dockerfile.player")
    scp_upload(str(LOCAL_PATH / "Dockerfile.admin"), f"{REMOTE_DIR}/Dockerfile.admin")

    if (LOCAL_PATH / ".dockerignore").exists():
        scp_upload(str(LOCAL_PATH / ".dockerignore"), f"{REMOTE_DIR}/.dockerignore")

    # `.env` racine sert au compose pour resoudre les ${VAR} (build args).
    # On NE le commit pas — il vit hors-repo sur le poste (voir .env.deploy).
    deploy_env = LOCAL_PATH / ".env.deploy"
    if deploy_env.exists():
        step("Upload .env (compose build args)")
        scp_upload(str(deploy_env), f"{REMOTE_DIR}/.env")
        run_remote(f"chmod 600 {REMOTE_DIR}/.env")
    else:
        warn(".env.deploy absent localement : on ne touche pas a /opt/docker/mon2027/.env")
        warn("Cree .env.deploy a la racine du repo pour le synchroniser ici.")

    ok("Compose uploade")


def upload_env_runtime():
    header("UPLOAD .env runtime (player + admin)")

    warn("Les .env locaux sont adaptes a la prod a l'arrivee : DATABASE_URL -> file:/data/prod.db,")
    warn("NODE_ENV=production, TRUST_PROXY=xff-last (nginx ajoute l'IP client en fin de XFF).")

    # TRUST_PROXY est force : le .env local n'en a pas (ou vaut "none"), et
    # sans lui le rate-limit retombe sur une cle unique partagee par TOUS les
    # visiteurs (ex. 5 inscriptions/heure pour tout le site).
    forced = {
        "player": "NODE_ENV=production\\nTRUST_PROXY=xff-last",
        "admin": "NODE_ENV=production\\nTRUST_PROXY=xff-last\\nNEXT_BASE_PATH=/admin",
    }
    for app, lines in forced.items():
        local_env = LOCAL_PATH / app / ".env"
        if not local_env.exists():
            err(f"{app}/.env introuvable")
            sys.exit(1)
        step(f"Upload + adaptation prod du .env {app}")
        env_path = f"{REMOTE_DIR}/{app}/.env"
        scp_upload(str(local_env), env_path)
        run_remote(
            f"sed -i 's|file:./dev.db|file:/data/prod.db|' {env_path} && "
            # ADMIN_USER/ADMIN_PASSWORD : ancien Basic-Auth, remplace par les
            # comptes contributeurs.
            f"sed -i '/^NODE_ENV=/d; /^TRUST_PROXY=/d; /^NEXT_BASE_PATH=/d; /^ADMIN_USER=/d; /^ADMIN_PASSWORD=/d' {env_path} && "
            # \\n initial : protege contre un .env local sans saut de ligne final.
            f"printf '\\n{lines}\\n' >> {env_path} && "
            f"chmod 600 {env_path}"
        )

    ok(".env runtime uploades")

    if input("Restart les containers pour prendre en compte ? (o/N): ").strip().lower() == "o":
        run_remote(f"{COMPOSE_CMD} restart mon2027-player mon2027-admin")


# ============================================================
# NGINX
# ============================================================

def deploy_nginx():
    header("CONFIG NGINX (container prod_nginx)")
    conf = LOCAL_PATH / "nginx-mon2027-full.conf"
    if not conf.exists():
        err(f"{conf} introuvable")
        sys.exit(1)

    step("Upload conf via /tmp puis sudo mv vers conf.d")
    scp_upload(str(conf), "/tmp/mon2027.conf")
    run_remote(f"sudo mv /tmp/mon2027.conf {NGINX_CONF_DIR}/mon2027.conf")

    step("nginx -t puis reload")
    run_remote("sudo docker exec prod_nginx nginx -t")
    run_remote("sudo docker exec prod_nginx nginx -s reload")
    ok("nginx reloade")


# ============================================================
# SCRIPTS EXECUTES DANS LE CONTAINER
# ============================================================

def scp_download(remote, local):
    step(f"SCP: {remote} -> {local}")
    r = subprocess.run(f'scp {SSH_HOST}:{remote} "{local}"', shell=True)
    if r.returncode != 0:
        err("Telechargement echoue")
        sys.exit(1)


def run_in_container(script, args="", upload=(), download=None):
    """Execute scripts/<script> dans le container player, avec le client Prisma
    de l'image (meme schema que le code deploye). `upload` : [(local, chemin
    container)] copies avant ; `download` : (chemin container, local) rapatrie
    apres succes. Tout est nettoye ensuite. Retourne (code, sortie)."""
    remote_script = f"/tmp/mon2027-{script}"
    staged = [(str(LOCAL_PATH / "scripts" / script), remote_script)] + [(str(l), r) for l, r in upload]
    for local, remote in staged:
        scp_upload(local, remote)
    remote_paths = [r for _, r in staged] + ([download[0]] if download else [])
    try:
        run_remote(" && ".join(f"sudo docker cp {r} {PLAYER_CONTAINER}:{r}" for _, r in staged))
        rc, out = run_remote_capture(f"sudo docker exec {PLAYER_CONTAINER} node {remote_script} {args}")
        if download and rc == 0:
            run_remote(f"sudo docker cp {PLAYER_CONTAINER}:{download[0]} {download[0]} && sudo chown $(id -u) {download[0]}")
            scp_download(download[0], download[1])
    finally:
        paths = " ".join(remote_paths)
        run_remote(f"rm -f {paths}; sudo docker exec -u 0 {PLAYER_CONTAINER} rm -f {paths}", check=False)
    return rc, out


def split_result(out):
    """Separe la sortie lisible de la ligne RESULT_JSON des scripts."""
    result, lines = None, []
    for line in out.splitlines():
        if line.startswith("RESULT_JSON:"):
            result = json.loads(line[len("RESULT_JSON:"):])
        else:
            lines.append(line)
    return "\n".join(lines).rstrip(), result


# ============================================================
# CONTENU (questions + sources) — la prod fait reference
# ============================================================

CONTENT_TABLES = ("Question", "Source")
LOCAL_DB = LOCAL_PATH / "prisma" / "dev.db"
# Empreintes du contenu tel qu'il etait en prod lors du dernier pull/push,
# question par question : permet de distinguer "modifie chez moi" de
# "modifie en prod par un contributeur" (detection de conflits).
CONTENT_BASE_FILE = LOCAL_PATH / "prisma" / "content-base.json"


def load_base():
    try:
        return json.loads(CONTENT_BASE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def save_base(base):
    CONTENT_BASE_FILE.write_text(json.dumps(base, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def export_content(db_path, out_path):
    """Exporte la base de connaissances locale (Question + Source) en JSON,
    avec la liste des migrations appliquees pour verifier cote prod que les
    deux schemas sont identiques. Lecture seule : dev.db n'est jamais modifiee,
    et aucune donnee joueur (User, Answer, Defi...) ne quitte le poste."""
    con = sqlite3.connect(f"{Path(db_path).resolve().as_uri()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        data = {
            "migrations": [
                r[0]
                for r in con.execute(
                    "SELECT migration_name FROM _prisma_migrations "
                    "WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL "
                    "ORDER BY migration_name"
                )
            ]
        }
        for table in CONTENT_TABLES:
            data[table] = [dict(r) for r in con.execute(f'SELECT * FROM "{table}"')]
    finally:
        con.close()
    Path(out_path).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def sync_content():
    """Envoie le contenu local (tes batchs, tes modifs) en prod par FUSION :
    nouvelles questions creees, questions que personne n'a touchees en prod
    mises a jour, conflits signales et ignores, rien n'est jamais supprime.
    Les joueurs et le travail des contributeurs (historique, validations,
    discussion) ne sont pas touches. Sauvegarde de prod.db avant ecriture."""
    header("ENVOI DU CONTENU LOCAL -> PROD (fusion)")
    if not LOCAL_DB.exists():
        err(f"{LOCAL_DB} introuvable")
        sys.exit(1)
    remote_export = "/tmp/mon2027-content.json"

    with tempfile.TemporaryDirectory() as tmp:
        export = Path(tmp) / "content.json"
        data = export_content(LOCAL_DB, export)
        data["base"] = load_base()
        export.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        published = sum(1 for q in data["Question"] if q.get("statut") == "publie")
        ok(f"Export local : {len(data['Question'])} questions ({published} publiees), {len(data['Source'])} sources")
        if not data["base"]:
            warn("Pas encore de base de synchro (premier envoi, ou jamais de pull) : les questions")
            warn("deja retouchees par un contributeur en prod seront traitees comme des conflits.")

        step("Apercu des changements")
        rc, out = run_in_container("content-sync.cjs", f"push {remote_export}", upload=[(export, remote_export)])
        text, _ = split_result(out)
        print(text)
        if rc != 0:
            err("Envoi interrompu - la prod n'a pas ete modifiee.")
            sys.exit(1)
        if "aperçu uniquement" not in text:
            ok("Rien a envoyer.")
            return
        if input("\nAppliquer en prod ? (tape OUI): ").strip() != "OUI":
            warn("Annule - rien n'a ete modifie.")
            return

        step("Sauvegarde + envoi")
        rc, out = run_in_container("content-sync.cjs", f"push {remote_export} --apply", upload=[(export, remote_export)])
        text, result = split_result(out)
        print(text)
        if rc != 0 or result is None:
            err("Envoi interrompu - la prod n'a pas ete modifiee.")
            sys.exit(1)

    base = load_base()
    base.update(result.get("baseUpdates", {}))
    save_base(base)
    ok("Contenu en prod. Les pages /q/... se rafraichissent sous 5 min (ISR).")


def pull_content():
    """Recupere le contenu de prod (questions + sources, avec le travail des
    contributeurs) dans prisma/dev.db. Tes donnees de test locales (comptes,
    reponses) sont conservees ; seules les tables Question et Source sont
    remplacees. Sauvegarde locale de dev.db avant."""
    header("RECUPERATION DU CONTENU DE PROD -> LOCAL")
    warn("Remplace les questions et sources de prisma/dev.db par celles de la prod.")
    warn("Tes modifications locales pas encore envoyees (content) seront perdues.")
    if input("Continuer ? (o/N): ").strip().lower() != "o":
        return
    remote_export = "/tmp/mon2027-pull.json"

    with tempfile.TemporaryDirectory() as tmp:
        local_export = Path(tmp) / "prod-content.json"
        rc, out = run_in_container(
            "content-sync.cjs", f"export {remote_export}", download=(remote_export, local_export)
        )
        print(out.rstrip())
        if rc != 0:
            err("Export de prod echoue")
            sys.exit(1)

        if LOCAL_DB.exists():
            backup = LOCAL_DB.with_name(f"dev.db.backup-{time.strftime('%Y%m%d-%H%M%S')}")
            src = sqlite3.connect(f"{LOCAL_DB.resolve().as_uri()}?mode=ro", uri=True)
            dst = sqlite3.connect(backup)
            src.backup(dst)
            dst.close()
            src.close()
            ok(f"Sauvegarde locale : {backup}")

        step("Remplacement du contenu local")
        r = subprocess.run(
            ["node", str(LOCAL_PATH / "scripts" / "content-sync.cjs"), "replace", str(local_export), "--apply"],
            cwd=LOCAL_PATH / "player",
            env={**os.environ, "DATABASE_URL": f"file:{LOCAL_DB.resolve().as_posix()}"},
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        text, result = split_result((r.stdout or "") + (r.stderr or ""))
        print(text)
        if r.returncode != 0 or result is None:
            err("Remplacement local echoue (dev.db inchangee).")
            sys.exit(1)

    save_base(result["base"])
    ok("Base locale alignee sur la prod.")


# ============================================================
# MIGRATIONS & SAUVEGARDES
# ============================================================

# Migration de rattrapage (tables creees jadis par `db push`) : deja presente
# dans prod.db, elle doit etre marquee appliquee sans etre executee.
BASELINE_MIGRATION = "20261107210000_rattrapage_comptes_joueurs"


def run_migrations():
    """Le client Prisma est genere au build d'image et le standalone embarque
    `prisma migrate deploy`. Migrations executees directement dans le container,
    apres sauvegarde."""
    header("PRISMA MIGRATE DEPLOY")

    rc, out = run_in_container("migrate-baseline.cjs", BASELINE_MIGRATION)
    if rc != 0:
        print(out)
        err("Verification de la migration de rattrapage impossible")
        sys.exit(1)
    if "RESOLVE" in out:
        step("Migration de rattrapage marquee comme appliquee (tables deja presentes)")
        run_remote(f"sudo docker exec {PLAYER_CONTAINER} npx prisma migrate resolve --applied {BASELINE_MIGRATION}")

    step("Statut")
    rc, out = run_remote_capture(f"sudo docker exec {PLAYER_CONTAINER} npx prisma migrate status")
    print(out)
    if "have not yet been applied" in out or "Database schema is not up to date" in out:
        step("Sauvegarde avant migration")
        ok(f"Sauvegarde : {remote_backup()}")
        run_remote(f"sudo docker exec {PLAYER_CONTAINER} npx prisma migrate deploy")
        run_remote(f"{COMPOSE_CMD} restart mon2027-player mon2027-admin")
        ok("Migrations appliquees, containers redemarres")
    else:
        ok("Aucune migration en attente")


LOCAL_BACKUP_DIR = LOCAL_PATH / "backups"


def remote_backup():
    """Copie coherente de prod.db dans le volume (/data/backups, 5 dernieres
    copies manuelles gardees). Retourne le chemin dans le container."""
    rc, out = run_in_container("db-backup.cjs")
    lines = [l for l in out.strip().splitlines() if l.strip()]
    if rc != 0 or not lines or not lines[-1].startswith("/"):
        print(out)
        err("Sauvegarde echouee")
        sys.exit(1)
    return lines[-1].strip()


def backup_db():
    """Rapatrie une copie complete de la base de prod dans backups/ (gitignore).
    Contient des donnees joueurs (pseudos, hash de mots de passe) : a garder
    hors de tout depot et de tout partage."""
    header("SAUVEGARDE prod.db -> poste local")
    remote_path = remote_backup()
    name = remote_path.rsplit("/", 1)[-1]
    tmp = f"/tmp/{name}"
    LOCAL_BACKUP_DIR.mkdir(exist_ok=True)
    local = LOCAL_BACKUP_DIR / name
    try:
        run_remote(f"sudo docker cp {PLAYER_CONTAINER}:{remote_path} {tmp} && sudo chown $(id -u) {tmp}")
        scp_download(tmp, local)
    finally:
        run_remote(f"rm -f {tmp}", check=False)
    size_mb = local.stat().st_size / 1_000_000
    ok(f"Sauvegarde locale : {local} ({size_mb:.1f} Mo)")


def install_backup_cron():
    """Installe sur le serveur une sauvegarde quotidienne de prod.db (3 h 30,
    14 jours gardes dans /var/backups/mon2027, copie a chaud sqlite3 .backup,
    verification d'integrite). Idempotent : relancer reinstalle."""
    header("SAUVEGARDE QUOTIDIENNE (cron serveur)")
    local_script = LOCAL_PATH / "scripts" / "server-backup.sh"
    # Fins de ligne Unix obligatoires pour un script shell execute sur le serveur.
    with tempfile.TemporaryDirectory() as tmp:
        script = Path(tmp) / "mon2027-backup.sh"
        script.write_bytes(local_script.read_bytes().replace(b"\r\n", b"\n"))
        cron = Path(tmp) / "mon2027-backup.cron"
        cron.write_bytes(
            b"# Sauvegarde quotidienne de la base Mon2027 (python deploy.py backup-cron)\n"
            b"30 3 * * * root /usr/local/bin/mon2027-backup.sh >> /var/log/mon2027-backup.log 2>&1\n"
        )
        scp_upload(str(script), "/tmp/mon2027-backup.sh")
        scp_upload(str(cron), "/tmp/mon2027-backup.cron")
    run_remote(
        "command -v sqlite3 >/dev/null || sudo apt-get install -y sqlite3 >/dev/null; "
        "sudo install -m 755 /tmp/mon2027-backup.sh /usr/local/bin/mon2027-backup.sh && "
        "sudo install -m 644 /tmp/mon2027-backup.cron /etc/cron.d/mon2027-backup && "
        "rm -f /tmp/mon2027-backup.sh /tmp/mon2027-backup.cron"
    )
    step("Premiere sauvegarde immediate (test)")
    run_remote("sudo /usr/local/bin/mon2027-backup.sh")
    ok("Sauvegarde quotidienne installee (/var/backups/mon2027, 14 jours).")
    warn("Ces copies restent sur le serveur : fais aussi `python deploy.py backup` de temps en temps.")


# ============================================================
# COMPTES CONTRIBUTEURS
# ============================================================

def manage_contributor():
    """Comptes de l'espace contributeurs en prod (seul moyen de creer un
    superadmin). Ex. : python deploy.py contributor create <login> superadmin <nom>"""
    header("COMPTES CONTRIBUTEURS (prod)")
    args = sys.argv[2:] if len(sys.argv) > 2 else shlex.split(
        input("Commande (list | create <login> <role> [nom] | reset <login> | role <login> <role>\n"
              "          | disable <login> | enable <login>) : ")
    )
    if not args:
        args = ["list"]
    if any('"' in a for a in args):
        err("Pas de guillemets doubles dans les arguments.")
        sys.exit(1)
    rc, out = run_in_container("contributor.cjs", " ".join(shlex.quote(a) for a in args))
    print(out.rstrip())
    if rc != 0:
        sys.exit(1)


# ============================================================
# CERTBOT
# ============================================================

def install_cert():
    header("CERTBOT LET'S ENCRYPT")
    warn(f"{DOMAIN} et www.{DOMAIN} DOIVENT pointer sur l'IP du VPS")
    if input("DNS configure ? Continuer ? (o/N): ").strip().lower() != "o":
        return
    run_remote(
        f"sudo docker run --rm "
        f"-v {CERTBOT_CONF_VOL}:/etc/letsencrypt "
        f"-v {CERTBOT_WWW_VOL}:/var/www/certbot "
        f"certbot/certbot certonly --webroot --webroot-path /var/www/certbot "
        f"--non-interactive --agree-tos --email {CERT_EMAIL} "
        f"-d {DOMAIN} -d www.{DOMAIN}"
    )
    ok(f"Certificat obtenu (jusqu'a 90 jours, renew auto par prod_certbot)")


# ============================================================
# PROVISIONING
# ============================================================

def init_vps():
    header("PROVISIONNEMENT INITIAL DU VPS")
    warn(f"Cible : {SSH_HOST}:{REMOTE_DIR}")
    warn("Pre-requis cote VPS : Docker, container prod_nginx + prod_certbot")
    warn("deja deployes, network docker_backend-net existant.")
    if input("Continuer ? (o/N): ").strip().lower() != "o":
        return

    step("Creation des dossiers")
    run_remote(
        f"sudo mkdir -p {REMOTE_DIR}/player {REMOTE_DIR}/admin {REMOTE_DIR}/prisma && "
        f"sudo chown -R ubuntu:ubuntu {REMOTE_DIR}"
    )

    step("Upload sources initiales")
    for app in ("player", "admin"):
        sync_upload(LOCAL_PATH / app, f"{REMOTE_DIR}/{app}", exclude=APP_EXCLUDES)
    sync_upload(LOCAL_PATH / "prisma", f"{REMOTE_DIR}/prisma", exclude=["dev.db*", "content-base.json"])
    scp_upload(str(LOCAL_PATH / "package.json"), f"{REMOTE_DIR}/package.json")
    scp_upload(str(LOCAL_PATH / "package-lock.json"), f"{REMOTE_DIR}/package-lock.json")

    upload_compose()
    upload_env_runtime()

    step("Build initial des images")
    run_remote(f"{COMPOSE_CMD} build")

    step("Creation du volume DB")
    run_remote(f"sudo docker volume create {DB_VOLUME}", check=False)
    # /data doit etre inscriptible par l'uid 1001 du container : SQLite cree
    # son journal a cote du .db (sinon SQLITE_READONLY_DIRECTORY au 1er write).
    run_remote(f"sudo docker run --rm -v {DB_VOLUME}:/data alpine chown 1001:1001 /data")

    step("Lancement des containers")
    run_remote(f"{COMPOSE_CMD} up -d")

    step("Creation du schema (prisma migrate deploy)")
    run_remote(f"sudo docker exec {PLAYER_CONTAINER} npx prisma migrate deploy")

    if input("Envoyer maintenant le contenu local (questions + sources) ? (o/N): ").strip().lower() == "o":
        sync_content()

    warn("Etapes suivantes :")
    warn("  1. python deploy.py nginx   (conf vhost mon2027.fr)")
    warn(f"  2. python deploy.py cert   (cert Let's Encrypt — DNS {DOMAIN} prerequis)")
    warn("  3. python deploy.py contributor create <login> superadmin <nom>   (ton compte)")
    warn("  4. Verifier https://mon2027.fr et https://mon2027.fr/admin")


# ============================================================
# MAINTENANCE
# ============================================================

def status():
    header("STATUT")
    run_remote(f"{COMPOSE_CMD} ps", check=False)


def logs():
    header("LOGS (Ctrl+C pour quitter)")
    print("1. player  2. admin  3. les deux")
    c = input("Choix: ").strip()
    svc = {"1": "mon2027-player", "2": "mon2027-admin"}.get(c, "")
    run_remote(f"{COMPOSE_CMD} logs --tail=100 -f {svc}", check=False)


def restart():
    header("RESTART")
    run_remote(f"{COMPOSE_CMD} restart mon2027-player mon2027-admin")


# ============================================================
# MENU
# ============================================================

def menu():
    print(f"""
{C.BOLD}+=========================================================+
|         Mon2027 - Deploiement                           |
+=========================================================+{C.END}

{C.CYAN}Deploiement :{C.END}
  1. Player      (upload + rebuild image + restart)
  2. Admin       (espace contributeurs, sous /admin)
  3. Tout        (compose + player + admin)
  4. Compose     (docker-compose.yml + Dockerfiles + .env build args)
  5. Env         (player/.env + admin/.env runtime)
  6. Nginx       (conf mon2027.conf + reload prod_nginx)

{C.CYAN}Contenu & base :{C.END}
  7. Content     (envoi du contenu local -> prod, par fusion)
  8. Pull        (contenu de prod -> base locale)
  9. Migrate     (prisma migrate deploy, sauvegarde avant)
 10. Backup      (copie de prod.db -> backups/ en local)
 11. Backup-cron (sauvegarde quotidienne sur le serveur)
 12. Contributor (comptes de l'espace contributeurs)

{C.CYAN}Provisionnement (premiere fois) :{C.END}
 13. Init        (creation dirs + premier deploiement)
 14. Cert        (certbot Let's Encrypt)

{C.CYAN}Maintenance :{C.END}
 15. Statut
 16. Logs
 17. Restart

  0. Quitter
""")


ACTIONS = {
    "player": deploy_player,
    "admin": deploy_admin,
    "all": deploy_all,
    "compose": upload_compose,
    "env": upload_env_runtime,
    "nginx": deploy_nginx,
    "content": sync_content,
    "pull": pull_content,
    "migrate": run_migrations,
    "backup": backup_db,
    "backup-cron": install_backup_cron,
    "contributor": manage_contributor,
    "init": init_vps,
    "cert": install_cert,
    "status": status,
    "logs": logs,
    "restart": restart,
}

# Ordre du menu interactif (numero affiche -> commande).
MENU_ORDER = [
    "player", "admin", "all", "compose", "env", "nginx",
    "content", "pull", "migrate", "backup", "backup-cron", "contributor",
    "init", "cert",
    "status", "logs", "restart",
]


def main():
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd == "seed":
            err("`seed` n'existe plus : il ecrasait les joueurs et le travail des contributeurs.")
            print("Envoyer le contenu local : python deploy.py content   ·   recuperer la prod : python deploy.py pull")
            sys.exit(1)
        if cmd in ACTIONS:
            ACTIONS[cmd]()
        else:
            err(f"Commande inconnue: {cmd}")
            print(f"Commandes: {', '.join(ACTIONS)}")
            sys.exit(1)
        return

    while True:
        menu()
        c = input("Choix: ").strip()
        if c == "0":
            break
        if c.isdigit() and 1 <= int(c) <= len(MENU_ORDER):
            try:
                ACTIONS[MENU_ORDER[int(c) - 1]]()
            except KeyboardInterrupt:
                print("\nInterrompu.")
        else:
            warn("Choix invalide")
        input(f"\n{C.CYAN}Entree pour continuer...{C.END}")


if __name__ == "__main__":
    main()
