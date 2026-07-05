import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "asl-les-tilleuls" },
    update: {},
    create: {
      name: 'Association Syndicale Libre "LES TILLEULS"',
      slug: "asl-les-tilleuls",
    },
  });

  const assembly = await prisma.assembly.create({
    data: {
      organizationId: organization.id,
      title: "Assemblée Générale Extraordinaire - 24 juillet 2026",
      date: new Date("2026-07-24T19:00:00+02:00"),
      location: "Salle polyvalente de Lent",
      status: "DRAFT",
      resolutions: {
        create: [
          {
            title: "Vote des travaux de réfection des caniveaux",
            description:
              "Décision concernant la réalisation ou non des travaux de réfection des caniveaux du lotissement.",
            order: 1,
            choices: {
              create: [
                { label: "Pour", order: 1 },
                { label: "Contre", order: 2 },
                { label: "Abstention", order: 3 },
              ],
            },
          },
          {
            title: "Choix de l'entreprise retenue pour les travaux",
            description:
              "Vote pour choisir l'un des devis présentés lors de l'assemblée générale.",
            order: 2,
            choices: {
              create: [
                { label: "COTTET Jardins - 1 602,00 € TTC", order: 1 },
                { label: "SOTRAPP TP - 3 531,00 € TTC", order: 2 },
                { label: "SOCAFL - 4 194,72 € TTC", order: 3 },
                { label: "RENATO DURAO TP - 5 609,60 € TTC", order: 4 },
                { label: "Abstention", order: 5 },
              ],
            },
          },
          {
            title: "Modalités de paiement des travaux",
            description:
              "Vote concernant le paiement comptant ou en plusieurs appels de fonds.",
            order: 3,
            choices: {
              create: [
                { label: "Paiement comptant", order: 1 },
                { label: "Paiement en plusieurs fois", order: 2 },
                { label: "Abstention", order: 3 },
              ],
            },
          },
          {
            title: "Élection d'un(e) nouveau(elle) secrétaire",
            description:
              "Suite à la démission de Madame Nadège Djeridi, élection d'un(e) nouveau(elle) secrétaire de l'association.",
            order: 4,
            choices: {
              create: [
                { label: "Candidat 1", order: 1 },
                { label: "Candidat 2", order: 2 },
                { label: "Abstention", order: 3 },
              ],
            },
          },
        ],
      },
    },
  });

  console.log("✅ Seed terminé");
  console.log(`Organisation : ${organization.name}`);
  console.log(`Assemblée : ${assembly.title}`);
}

main()
  .catch((error) => {
    console.error("❌ Erreur seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
