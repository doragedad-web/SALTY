import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from the current channel')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    execute: withErrorHandling(async (interaction) => {
        const amount = interaction.options.getInteger('amount');

        const deleted = await interaction.channel.bulkDelete(amount, true);

        await InteractionHelper.safeReply(interaction, {
            content: `🗑️ Deleted ${deleted.size} messages.`,
            ephemeral: true
        });
    }, { command: 'purge' })
};
