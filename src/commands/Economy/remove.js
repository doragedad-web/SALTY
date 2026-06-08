import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('removemoney')
        .setDescription("Remove money from a user's wallet (Admin only)")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to remove money from')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of money to remove')
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

        logger.debug(`[ECONOMY] removemoney requested`, {
            adminId: interaction.user.id,
            targetId: targetUser.id,
            amount,
            guildId
        });

        if (targetUser.bot) {
            throw createError(
                'Bot user targeted for removemoney',
                ErrorTypes.VALIDATION,
                'You cannot remove money from a bot.'
            );
        }

        const userData = await EconomyService.removeMoney(client, guildId, targetUser.id, amount, 'admin_removemoney');

        const embed = createEmbed({
            title: '💸 Money Removed',
            description: `Successfully removed **$${amount.toLocaleString()}** from ${targetUser}'s wallet.`,
            color: 'error'
        })
            .addFields(
                {
                    name: '💵 New Wallet Balance',
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: '👤 Removed By',
                    value: `${interaction.user}`,
                    inline: true,
                }
            )
            .setFooter({
                text: `Action by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL(),
            });

        logger.info(`[ECONOMY] Admin removed money`, {
            adminId: interaction.user.id,
            targetId: targetUser.id,
            amount,
            newWallet: userData.wallet,
            guildId
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'removemoney' })
};
