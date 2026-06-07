import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription("Add money to a user's wallet (Admin only)")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to add money to')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of money to add')
                .setMinValue(1)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const hasPerms = await checkUserPermissions(
            interaction,
            PermissionFlagsBits.Administrator,
            'Only administrators can use this command.'
        );
        if (!hasPerms) return;

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const guildId = interaction.guildId;

        if (targetUser.bot) {
            throw createError(
                "Bot user targeted for addmoney",
                ErrorTypes.VALIDATION,
                "You cannot add money to a bot."
            );
        }

        const userData = await EconomyService.addMoney(client, guildId, targetUser.id, amount, 'admin_addmoney');

        const embed = createEmbed({
            title: '💰 Money Added',
            description: `Successfully added **$${amount.toLocaleString()}** to ${targetUser}'s wallet.`,
        })
            .addFields(
                { name: '💵 New Wallet Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true },
                { name: '👤 Added By', value: `${interaction.user}`, inline: true }
            )
            .setFooter({
                text: `Action by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL(),
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'addmoney' })
};
