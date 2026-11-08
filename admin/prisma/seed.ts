import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.source.deleteMany();
  await prisma.question.deleteMany();

  await prisma.question.create({
    data: {
      customId: "Q-IMM-001",
      theme: "Immigration",
      sousTheme: "Démographie",
      format: "estimation_numerique",
      statut: "publie",
      sensibilite: "haute",
      difficulte: 2,
      question:
        "Quel pourcentage de la population vivant en France est immigré ?",
      precisions:
        "Une personne immigrée est née étrangère à l'étranger et réside en France (définition INSEE).",
      explication:
        "La part d'immigrés est stable autour de 10% depuis ~15 ans. Ipsos Perils of Perception (2022) montre que les Français l'estiment en moyenne à 28%.",
      contextePedagogique:
        "L'écart perception/réalité ouvre la question : d'où vient cette perception ?",
      unite: "%",
      plageMin: 0,
      plageMax: 50,
      reponseNumerique: 10.3,
      toleranceVerte: 2,
      toleranceOrange: 5,
      dateDonnee: 2023,
      auteur: "mon2027",
      sources: {
        create: [
          {
            nom: "INSEE — Étrangers, immigrés",
            url: "https://www.insee.fr/fr/statistiques/3633212",
            type: "primaire",
            ordre: 0,
          },
        ],
      },
    },
  });

  await prisma.question.create({
    data: {
      customId: "Q-SEC-002",
      theme: "Sécurité",
      sousTheme: "Homicides",
      format: "vrai_faux",
      statut: "brouillon",
      sensibilite: "critique",
      difficulte: 3,
      question:
        "Le nombre d'homicides en France est à un niveau historiquement bas depuis les années 1980.",
      explication:
        "Le taux d'homicides est passé d'environ 4 à 1 pour 100 000 habitants entre 1980 et aujourd'hui (source SSMSI). C'est un fait largement méconnu.",
      payload: JSON.stringify({ reponseCorrecte: true }),
      dateDonnee: 2023,
      auteur: "mon2027",
      sources: {
        create: [
          {
            nom: "SSMSI — Insécurité et délinquance en 2023",
            url: "https://www.interieur.gouv.fr/Interstats",
            type: "primaire",
            ordre: 0,
          },
        ],
      },
    },
  });

  console.log("Seed OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
