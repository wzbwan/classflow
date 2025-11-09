import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // Clear existing (dev only)
  await prisma.grade.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  const pass = await bcrypt.hash("pass1234", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Admin",
      email: "admin@example.com",
      studentId: "admin",
      role: "ADMIN",
      passwordHash: pass,
    },
  });

  const teacher = await prisma.user.create({
    data: {
      name: "Teacher Zhang",
      email: "t001@example.com",
      studentId: "t001",
      role: "TEACHER",
      passwordHash: pass,
    },
  });

  const student = await prisma.user.create({
    data: {
      name: "Student Li",
      email: "s001@example.com",
      studentId: "s001",
      role: "STUDENT",
      passwordHash: pass,
    },
  });

  const course = await prisma.course.create({
    data: {
      name: "软件工程",
      term: "2025春",
      code: "SE101",
      ownerId: teacher.id,
      enrollments: {
        create: [
          { userId: teacher.id, roleInCourse: "TEACHER" },
          { userId: student.id, roleInCourse: "STUDENT" },
        ],
      },
    },
  });

  const a1 = await prisma.assignment.create({
    data: {
      courseId: course.id,
      title: "作业1：需求分析",
      description: "提交 PDF 报告，10 页以内",
      dueAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      allowLate: true,
      maxPoints: 100,
    },
  });

  console.log({ admin, teacher, student, course, a1 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
