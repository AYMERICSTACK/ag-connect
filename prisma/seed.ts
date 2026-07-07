import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
}) as any;

const initialMembers = [
  { lotNumber: "1", firstName: "Nathalie", lastName: "CARRARA", address: "15 rue des tilleuls", phone: "06.40.57.25.11", email: "nathalie.carrara@orange.fr" },
  { lotNumber: "2", firstName: "Nouara", lastName: "M. et Mme ZEMMIT", address: "16 rue des tilleuls", phone: "06.52.60.62.95 / 06.26.61.00.16", email: "nouaramess@outlook.fr" },
  { lotNumber: "3", firstName: "Nicolas / Marie", lastName: "M. et Mme OLLIER", address: "17 rue des tilleuls", phone: "07.71.68.94.82", email: "nicolas.ollier95@hotmail.fr" },
  { lotNumber: "4", firstName: "Sandra", lastName: "Mme ALVES DE FREITAS", address: "18 rue des tilleuls", phone: "06 01 85 64 58", email: "alvesdefreitas.sandra@gmail.com" },
  { lotNumber: "5", firstName: "", lastName: "COTTON Paul", address: "", phone: "06.30.16.22.87", email: "paulcotton01@gmail.com" },
  { lotNumber: "6", firstName: "Cyril", lastName: "Mr LOISY", address: "20 rue des tilleuls", phone: "06 10 15 13 71", email: "cyril_loisy@yahoo.com" },
  { lotNumber: "7", firstName: "Mirenne", lastName: "Mme CURTET", address: "21 rue des tilleuls", phone: "0678493064", email: "mirene.curtet1302@gmail.com" },
  { lotNumber: "8", firstName: "Guillaume / Lolita", lastName: "Mr JANDARD / Mme PILLARD", address: "22 rue des tilleuls", phone: "", email: "Pillardlolita@gmail.com / jandardguillaume@gmail.com" },
  { lotNumber: "9", firstName: "Alexandre", lastName: "Mr MOREAU", address: "309 chemin des fresnes", phone: "629853106", email: "974gossebo@live.fr" },
  { lotNumber: "10", firstName: "", lastName: "Mr et Mme RAULT", address: "2 rue des tilleuls", phone: "06.22.51.44.92 / 06.27.43.03.62", email: "yannrault@sfr.fr" },
  { lotNumber: "11", firstName: "", lastName: "Mr LAINE & Mme BLANCHOT", address: "4 rue des tilleuls", phone: "06 28 70 62 23 Mr/06 17 58 38 50", email: "anthony01390@outlook.fr" },
  { lotNumber: "12", firstName: "", lastName: "Mr DERONNE Mme PACCARD", address: "6 rue des tilleuls", phone: "06.63.68.04.26", email: "deronnepaul@gmail.com" },
  { lotNumber: "13", firstName: "", lastName: "Mr et Mme GIMARET/RIBES", address: "8 rue des tilleuls", phone: "06.49.01.47.28", email: "lau-lau38@hotmail.fr" },
  { lotNumber: "14", firstName: "", lastName: "Mr et MME DEMORY", address: "10 rue des tilleuls", phone: "06.64.21.45.78mr /mme 06.67.84.55.67", email: "marie.demory@hotmail.fr" },
  { lotNumber: "15", firstName: "", lastName: "Mr et Mme VRIGNAUD / GELLON", address: "13 rue des tilleuls", phone: "06 40 55 50 88 / 06 76 05 55 71", email: "j.vrignaud@icloud.com" },
  { lotNumber: "16", firstName: "", lastName: "Mr et Mme TAILLADE/DUNAND", address: "14 rue des tilleuls", phone: "06.34.44.18.30", email: "dunand.fanny@orange.fr" },
  { lotNumber: "17", firstName: "Sylvain", lastName: "Mr et Mme MOREL /DELERUE", address: "12 rue des tilleuls", phone: "06.65.74.23.41 /06.45.81 02.03", email: "sylmorel01@gmail.com" },
  { lotNumber: "18", firstName: "Christian", lastName: "Mr JOULAC", address: "11 rue des tilleuls", phone: "06.37.74.03.95", email: "joulac.christian@gmail.com" },
  { lotNumber: "19", firstName: "Quentin / Justine", lastName: "Mr et Mme VACHARD", address: "9 rue des tilleuls", phone: "06.26.50.70.22 / 06.34.49.06.90", email: "j-ju@live.fr" },
  { lotNumber: "20", firstName: "Charlotte", lastName: "Mr et Mme PELIN", address: "7 rue des tilleuls", phone: "07.83.45.67.38", email: "cha.grandjean@gmail.com" },
  { lotNumber: "21", firstName: "", lastName: "Mr GUICHON & Mme BOUCHARD", address: "5 rue des tilleuls", phone: "06 58 75 03 08", email: "guichon.mehdi@outlook.fr" },
  { lotNumber: "22", firstName: "Aymeric", lastName: "Mr DJERIDI et Mme COELHO", address: "3 rue des tilleuls", phone: "07 62 99 82 69 Mr/ 06 89 85 54 34 Mme", email: "adjeridito@gmail.com" },
  { lotNumber: "23", firstName: "Olivier", lastName: "Mr et Mme CALLENCE", address: "1 rue des tilleuls", phone: "06.23.29.83.75", email: "olivier.callence@gmail.com" },
  { lotNumber: "24", firstName: "Muhammed / Fayza", lastName: "Mr et Mme BEN HAMOU", address: "308 chemin des fresnes", phone: "06.51.70.06.09 / 07.60.52.50.02", email: "fayza15000@hotmail.fr" },
];

function makeAccessCode(lotNumber: string) {
  return `LT-${lotNumber.padStart(2, "0")}`;
}

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "asl-les-tilleuls" },
    update: {},
    create: {
      name: 'Association Syndicale Libre "LES TILLEULS"',
      slug: "asl-les-tilleuls",
    },
  });

  await prisma.assembly.deleteMany({
    where: {
      organizationId: organization.id,
      title: "Assemblée Générale Extraordinaire - 24 juillet 2026",
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

  for (const memberData of initialMembers) {
    const existingMember = await prisma.member.findFirst({
      where: {
        organizationId: organization.id,
        lotNumber: memberData.lotNumber,
      },
    });

    const member = existingMember
      ? await prisma.member.update({
          where: { id: existingMember.id },
          data: memberData,
        })
      : await prisma.member.create({
          data: {
            organizationId: organization.id,
            accessCode: makeAccessCode(memberData.lotNumber),
            voteWeight: 1,
            ...memberData,
          },
        });

    await prisma.attendance.upsert({
      where: {
        assemblyId_memberId: {
          assemblyId: assembly.id,
          memberId: member.id,
        },
      },
      update: {},
      create: {
        assemblyId: assembly.id,
        memberId: member.id,
        checkedIn: false,
      },
    });
  }

  console.log("✅ Seed terminé");
  console.log(`Organisation : ${organization.name}`);
  console.log(`Assemblée : ${assembly.title}`);
  console.log(`Propriétaires importés : ${initialMembers.length}`);
}

main()
  .catch((error) => {
    console.error("❌ Erreur seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
