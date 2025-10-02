'use server';
/**
 * @fileOverview Functions for generating comments for student report cards using AI.
 *
 * - generateReportCardComments: Generates personalized comments for a list of students.
 * - ReportCardCommentsInput: The Zod schema for the input of the generation function.
 * - ReportCardCommentsOutput: The Zod schema for the output of the generation function.
 */
import {ai} from '@/ai/genkit';
import {z} from 'zod';

const StudentPerformanceSchema = z.object({
  studentId: z.string().describe('The unique identifier for the student.'),
  studentName: z.string().describe('The full name of the student.'),
  division: z
    .string()
    .describe('The overall division or grade achieved by the student.'),
  aggregate: z
    .number()
    .describe('The total aggregate score for the student.'),
  subjectsPerformance: z
    .array(
      z.object({
        subjectName: z.string().describe('The name of the subject.'),
        grade: z.string().describe('The grade achieved in the subject.'),
      })
    )
    .describe('A list of subjects and the grades the student achieved.'),
});

export const ReportCardCommentsInputSchema = z.object({
  students: z
    .array(StudentPerformanceSchema)
    .describe('An array of student performance data.'),
});
export type ReportCardCommentsInput = z.infer<
  typeof ReportCardCommentsInputSchema
>;

export const ReportCardCommentsOutputSchema = z.object({
  comments: z
    .array(
      z.object({
        studentId: z
          .string()
          .describe('The unique identifier for the student.'),
        classTeacherComment: z
          .string()
          .describe("A constructive and personalized comment from the class teacher, focusing on the student's overall performance, strengths, and areas for improvement. The tone should be encouraging."),
        principalComment: z
          .string()
          .describe("A concise, high-level comment from the principal, summarizing the student's achievement for the term. The tone should be formal and encouraging."),
      })
    )
    .describe('An array of generated comments for each student.'),
});
export type ReportCardCommentsOutput = z.infer<
  typeof ReportCardCommentsOutputSchema
>;

const generateCommentsPrompt = ai.definePrompt({
  name: 'generateCommentsPrompt',
  input: {schema: ReportCardCommentsInputSchema},
  output: {schema: ReportCardCommentsOutputSchema},
  prompt: `
    You are an experienced educator in the Ugandan school system. Your task is to generate personalized report card comments for a list of students based on their academic performance for the term.

    For each student, provide two distinct comments:
    1.  **Class Teacher's Comment:** This should be a detailed and constructive remark (2-3 sentences). Mention specific strengths, identify areas needing improvement, and offer encouragement. The tone should be supportive and personal.
    2.  **Principal's Comment:** This should be a brief, formal, and encouraging summary of the student's performance (1 sentence).

    Use the following student data to generate the comments. Do not simply list the grades. Interpret the performance to create meaningful feedback.

    Students Data:
    {{#each students}}
    - Student Name: {{{studentName}}} (ID: {{{studentId}}})
      - Final Result: Division {{{division}}}, Aggregate {{{aggregate}}}
      - Subject Grades:
        {{#each subjectsPerformance}}
        - {{{subjectName}}}: {{{grade}}}
        {{/each}}
    {{/each}}
  `,
});

const generateCommentsFlow = ai.defineFlow(
  {
    name: 'generateCommentsFlow',
    inputSchema: ReportCardCommentsInputSchema,
    outputSchema: ReportCardCommentsOutputSchema,
  },
  async (input) => {
    const {output} = await generateCommentsPrompt(input);
    return output!;
  }
);

export async function generateReportCardComments(
  input: ReportCardCommentsInput
): Promise<ReportCardCommentsOutput> {
  return generateCommentsFlow(input);
}
