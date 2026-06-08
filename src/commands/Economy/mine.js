mport { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({ title: '💣 Mines', description: `Bet: **$${bet.toLocaleString()}**\nSafe picks: **0** | Multiplier: **1.00x**\n\nPick tiles to reveal gems. Avoid the bombs!`, color: 'info' })],
            components: buildGrid(revealed, false, minePositions)
        });

        const msg = await interaction.fetchReply().catch(() => null);
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
                const embed = createEmbed({ title: '💰 Mines — Cashed Out!', description: `You cashed out with **${revealed.length} safe picks** (${multiplier}x) and won **$${winnings.toLocaleString()}**!`, color: 'success' });
                embed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
                await i.update({ embeds: [embed], components: [] });
                return;
            }

            const idx = parseInt(i.customId.replace('mines_', ''));
            if (revealed.includes(idx)) return;

            if (minePositions.includes(idx)) {
                gameOver = true;
                collector.stop();
                const embed = createEmbed({ title: '💥 Mines — Boom!', description: `You hit a bomb on tile **${idx + 1}**!\nYou had **${revealed.length} safe picks** but lost it all. You lost **$${bet.toLocaleString()}**.`, color: 'error' });
                embed.addFields({ name: '💵 Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
                await i.update({ embeds: [embed], components: buildGrid(revealed, true, minePositions) });
                return;
            }

            revealed.push(idx);
            const multiplier = getMultiplier(revealed.length);
            const potentialWin = Math.floor(bet * multiplier);

            await i.update({
                embeds: [createEmbed({ title: '💣 Mines', description: `Bet: **$${bet.toLocaleString()}**\nSafe picks: **${revealed.length}** | Multiplier: **${multiplier.toFixed(2)}x**\nPotential win: **$${potentialWin.toLocaleString()}**\n\nKeep picking or cash out!`, color: 'info' })],
                components: buildGrid(revealed, false, minePositions)
            });
        });

        collector.on('end', async (_, reason) => {
            if (!gameOver && reason === 'time') {
                const multiplier = getMultiplier(revealed.length);
                if (revealed.length > 0) {
                    const winnings = Math.floor(bet * multiplier);
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += winnings;
                    await setEconomyData(client, guildId, userId, fresh);
                    const embed = createEmbed({ title: '⏰ Mines — Auto Cash Out', description: `Timed out! Auto cashed out at **${multiplier.toFixed(2)}x** for **$${winnings.toLocaleString()}**.`, color: 'success' });
                    embed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
                    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
                } else {
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += bet;
                    await setEconomyData(client, guildId, userId, fresh);
                    await interaction.editReply({ embeds: [createEmbed({ title: '⏰ Mines — Timed Out', description: 'No picks made — your bet was refunded.', color: 'info' })], components: [] }).catch(() => {});
                }
            }
        });
    }, { command: 'mines' })
};


