import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed, createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

const GRID_SIZE = 9;
const MINES = 3;

function buildGrid(revealed = [], hitMine = false, minePositions = []) {
    const rows = [];
    for (let row = 0; row < 3; row++) {
        const actionRow = new ActionRowBuilder();
        for (let col = 0; col < 3; col++) {
            const idx = row * 3 + col;
            let label = '?';
            let style = ButtonStyle.Secondary;
            let disabled = false;

            if (revealed.includes(idx)) {
                label = '💎';
                style = ButtonStyle.Success;
                disabled = true;
            } else if (hitMine && minePositions.includes(idx)) {
                label = '💣';
                style = ButtonStyle.Danger;
                disabled = true;
            } else if (hitMine) {
                disabled = true;
            }

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mines_${idx}`)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(disabled)
            );
        }
        rows.push(actionRow);
    }

    const cashOutRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('mines_cashout')
            .setLabel('💰 Cash Out')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(hitMine || revealed.length === 0)
    );
    rows.push(cashOutRow);
    return rows;
}

function getMultiplier(safeCount) {
    const multipliers = [0, 1.5, 2.0, 2.8, 4.0, 6.0, 9.0, 15.0, 25.0, 50.0];
    return multipliers[Math.min(safeCount, multipliers.length - 1)];
}

export default {
    data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Pick safe tiles to multiply your bet — avoid the bombs!')
        .addIntegerOption(option =>
            option.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const bet = interaction.options.getInteger('amount');

        const userData = await getEconomyData(client, guildId, userId);

        if (userData.wallet < bet) {
            throw createError('Insufficient funds', ErrorTypes.VALIDATION, `You only have **$${userData.wallet.toLocaleString()}** in your wallet.`);
        }

        const minePositions = [];
        while (minePositions.length < MINES) {
            const pos = Math.floor(Math.random() * GRID_SIZE);
            if (!minePositions.includes(pos)) minePositions.push(pos);
        }

        userData.wallet -= bet;
        await setEconomyData(client, guildId, userId, userData);

        const revealed = [];
        let gameOver = false;

        const embed = createEmbed({
            title: '💣 Mines',
            description: `Bet: **$${bet.toLocaleString()}**\nSafe picks: **0** | Multiplier: **1.00x**\n\nPick tiles to reveal gems. Avoid the bombs!`,
        });

        const msg = await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: buildGrid(revealed, false, minePositions)
        });

        if (!msg) return;

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.user.id === userId,
            time: 5 * 60 * 1000
        });

        collector.on('collect', async i => {
            if (gameOver) return;

            if (i.customId === 'mines_cashout') {
                gameOver = true;
                collector.stop();
                const multiplier = getMultiplier(revealed.length);
                const winnings = Math.floor(bet * multiplier);
                const fresh = await getEconomyData(client, guildId, userId);
                fresh.wallet += winnings;
                await setEconomyData(client, guildId, userId, fresh);
                const winEmbed = successEmbed('💰 Cashed Out!', `You cashed out with **${revealed.length} safe picks** (${multiplier}x) and won **$${winnings.toLocaleString()}**!`);
                winEmbed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
                await i.update({ embeds: [winEmbed], components: [] });
                return;
            }

            const idx = parseInt(i.customId.replace('mines_', ''));
            if (revealed.includes(idx)) return;

            if (minePositions.includes(idx)) {
                gameOver = true;
                collector.stop();
                const loseEmbed = errorEmbed('💥 Boom!', `You hit a bomb at tile **${idx + 1}**!\nYou lost **$${bet.toLocaleString()}**.`);
                loseEmbed.addFields({ name: '💵 Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
                await i.update({ embeds: [loseEmbed], components: buildGrid(revealed, true, minePositions) });
                return;
            }

            revealed.push(idx);
            const multiplier = getMultiplier(revealed.length);
            const potentialWin = Math.floor(bet * multiplier);

            const updatedEmbed = createEmbed({
                title: '💣 Mines',
                description: `Bet: **$${bet.toLocaleString()}**\nSafe picks: **${revealed.length}** | Multiplier: **${multiplier.toFixed(2)}x**\nPotential win: **$${potentialWin.toLocaleString()}**\n\nKeep picking or cash out!`,
            });

            await i.update({ embeds: [updatedEmbed], components: buildGrid(revealed, false, minePositions) });
        });

        collector.on('end', async (_, reason) => {
            if (!gameOver && reason === 'time') {
                const multiplier = getMultiplier(revealed.length);
                if (revealed.length > 0) {
                    const winnings = Math.floor(bet * multiplier);
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += winnings;
                    await setEconomyData(client, guildId, userId, fresh);
                    const timeEmbed = successEmbed('⏰ Timed Out — Auto Cash Out', `Auto cashed out at **${multiplier.toFixed(2)}x** for **$${winnings.toLocaleString()}**.`);
                    timeEmbed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
                    await interaction.editReply({ embeds: [timeEmbed], components: [] }).catch(() => {});
                } else {
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += bet;
                    await setEconomyData(client, guildId, userId, fresh);
                    await interaction.editReply({ embeds: [errorEmbed('⏰ Timed Out', 'Game timed out. Your bet was refunded.')], components: [] }).catch(() => {});
                }
            }
        });
    }, { command: 'mines' })
};
