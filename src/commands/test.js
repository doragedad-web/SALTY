import { SlashCommandBuilder } from 'discord.js';
import { loadingSteps } from '../../utils/loader.js';

export const data = new SlashCommandBuilder()
  .setName('test')
  .setDescription('Test loader');

export async function execute(interaction) {
  await loadingSteps(interaction, [
    "Step 1 loading",
    "Step 2 processing",
    "Step 3 finalizing"
  ]);
}
