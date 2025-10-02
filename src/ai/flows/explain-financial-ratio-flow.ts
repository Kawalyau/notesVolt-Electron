'use server';
/**
 * @fileOverview A Genkit flow for explaining financial ratios in simple terms.
 *
 * - explainFinancialRatio: Generates a simple explanation for a given financial ratio.
 * - ExplainFinancialRatioInput: The Zod schema for the input.
 * - ExplainFinancialRatioOutput: The Zod schema for the output.
 */
import {ai} from '@/ai/genkit';
import {z} from 'zod';

export const ExplainFinancialRatioInputSchema = z.object({
  ratioName: z.string().describe('The name of the financial ratio to explain.'),
  ratioValue: z
    .string()
    .describe('The calculated value of the ratio.'),
  context: z
    .string()
    .describe(
      'The context in which the ratio is being used, e.g., "for a school".'
    ),
});
export type ExplainFinancialRatioInput = z.infer<
  typeof ExplainFinancialRatioInputSchema
>;

export const ExplainFinancialRatioOutputSchema = z.object({
  explanation: z
    .string()
    .describe(
      'A brief, easy-to-understand explanation of the financial ratio, what it means for the given context, and what a "good" or "bad" value might indicate. The explanation should be suitable for a non-accountant.'
    ),
});
export type ExplainFinancialRatioOutput = z.infer<
  typeof ExplainFinancialRatioOutputSchema
>;

const explainRatioPrompt = ai.definePrompt({
  name: 'explainFinancialRatioPrompt',
  input: {schema: ExplainFinancialRatioInputSchema},
  output: {schema: ExplainFinancialRatioOutputSchema},
  prompt: `
    You are an expert accountant who is skilled at explaining complex financial concepts in simple terms to non-accountants.

    A user has asked for an explanation of a financial ratio.
    - Ratio Name: {{{ratioName}}}
    - Calculated Value: {{{ratioValue}}}
    - Context: {{{context}}}

    Please provide a concise (2-3 sentences) explanation that covers:
    1.  What this ratio generally measures.
    2.  What the calculated value might indicate in the given context.
    3.  A simple interpretation of whether the value is generally positive, negative, or needs more context.

    Your response should be clear, direct, and avoid technical jargon.
  `,
});

const explainFinancialRatioFlow = ai.defineFlow(
  {
    name: 'explainFinancialRatioFlow',
    inputSchema: ExplainFinancialRatioInputSchema,
    outputSchema: ExplainFinancialRatioOutputSchema,
  },
  async (input) => {
    const {output} = await explainRatioPrompt(input);
    return output!;
  }
);

export async function explainFinancialRatio(
  input: ExplainFinancialRatioInput
): Promise<ExplainFinancialRatioOutput> {
  return explainFinancialRatioFlow(input);
}
