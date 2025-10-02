/**
 * @fileoverview This file initializes the Genkit AI plugin.
 */
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

/**
 * The global `ai` object, which is used to register all AI functionality.
 */
export const ai = genkit({
  plugins: [googleAI()],
});
