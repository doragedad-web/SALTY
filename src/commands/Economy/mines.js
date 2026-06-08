mport { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { logger } from '../../utils/logger.js';

const GRID_SIZE = 9;
const MINE_COUNT = 3;

const MULTIPLIERS = [0, 1.5, 2.0, 2.8, 4.0, 6.0, 9.0, 15.0, 25.0, 50.0];
function getMultiplier(safeCount) {
    return MULTIPLIERS[Math.min(safeCount, MULTIPLIERS.length - 1)];
}

function buildGrid(revealed, hitMine, minePositions) {
    const rows = [];
    for (let row = 0; row < 3; row++) {
        const actionRow = new ActionRowBuilder();
        for (let col = 0; col < 3; col++) {
            const idx = row * 3 + col;
            let label, style, disabled;

            if (revealed.includes(idx)) {
                label = '💎';
                style = ButtonStyle.Success;
                disabled = true;
            } else if (hitMine && minePositions.includes(idx)) {
                label = '💣';
                style = ButtonStyle.Danger;
                disabled = true;
            } else {
                label = '?';
                style = ButtonStyle.Secondary;
                disabled = hitMine;
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

    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('mines_cashout')
            .setLabel('💰 Cash Out')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(hitMine || revealed.length === 0)
    ));

    return rows;
}

export default {
    data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Pick safe tiles to multiply your bet — avoid the bombs!')
        .addIntegerOption(option =>
            option.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)
        ),

    async execute(interaction, config, client) {
        try {
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const bet = interaction.options.getInteger('amount');

            const userData = await getEconomyData(client, guildId, userId);

            if (userData.wallet < bet) {
                return await interaction.reply({
                    embeds: [createEmbed({ title: '❌ Not Enough Money', description: `You only have **$${userData.wallet.toLocaleString()}** in your wallet.`, color: 'error' })],
                    flags: 64
                });
            }

            const minePositions = [];
            while (minePositions.length < MINE_COUNT) {
                const pos = Math.floor(Math.random() * GRID_SIZE);
                if (!minePositions.includes(pos)) minePositions.push(pos);
            }

            userData.wallet -= bet;
            await setEconomyData(client, guildId, userId, userData);

            const revealed = [];

            const startEmbed = createEmbed({
                title: '💣 Mines',
                description: `Bet: **$${bet.toLocaleString()}**\nSafe picks: **0** | Multiplier: **1.00x**\n\nPick tiles to reveal gems. Avoid the 3 bombs!`,
                color: 'info'
            });

            const message = await interaction.reply({
                embeds: [startEmbed],
                components: buildGrid(revealed, false, minePositions),
                flags: 0,
                fetchReply: true
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i => i.user.id === userId,
                time: 5 * 60 * 1000
            });

            let gameOver = false;

            collector.on('collect', async i => {
                if (gameOver) {
                    await i.deferUpdate().catch(() => {});
                    return;
                }

                if (i.customId === 'mines_cashout') {
                    gameOver = true;
                    collector.stop('cashout');

                    const multiplier = getMultiplier(revealed.length);
                    const winnings = Math.floor(bet * multiplier);
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += winnings;
                    await setEconomyData(client, guildId, userId, fresh);

                    const embed = createEmbed({
                        title: '💰 Mines — Cashed Out!',
                        description: `You cashed out with **${revealed.length} safe picks** (${multiplier}x)!\nYou won **$${winnings.toLocaleString()}**!`,
                        color: 'success'
                    });
                    embed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });

                    await i.update({ embeds: [embed], components: [] });
                    return;
                }

                const idx = parseInt(i.customId.replace('mines_', ''));

                if (minePositions.includes(idx)) {
                    gameOver = true;
                    collector.stop('boom');

                    const embed = createEmbed({
                        title: '💥 Mines — Boom!',
                        description: `You hit a bomb on tile **${idx + 1}**!\nYou had **${revealed.length} safe pick${revealed.length !== 1 ? 's' : ''}** but lost everything.\nYou lost **$${bet.toLocaleString()}**.`,
                        color: 'error'
                    });
                    embed.addFields({ name: '💵 Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });

                    await i.update({ embeds: [embed], components: buildGrid(revealed, true, minePositions) });
                    return;
                }

                revealed.push(idx);
                const multiplier = getMultiplier(revealed.length);
                const potentialWin = Math.floor(bet * multiplier);

                const embed = createEmbed({
                    title: '💣 Mines',
                    description: `Bet: **$${bet.toLocaleString()}**\nSafe picks: **${revealed.length}** | Multiplier: **${multiplier.toFixed(2)}x**\nPotential win: **$${potentialWin.toLocaleString()}**\n\nKeep picking or cash out!`,
                    color: 'info'
                });

                await i.update({ embeds: [embed], components: buildGrid(revealed, false, minePositions) });
            });

            collector.on('end', async (_, reason) => {
                if (gameOver) return;

                if (revealed.length > 0) {
                    const multiplier = getMultiplier(revealed.length);
                    const winnings = Math.floor(bet * multiplier);
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += winnings;
                    await setEconomyData(client, guildId, userId, fresh);

                    const embed = createEmbed({
                        title: '⏰ Mines — Auto Cash Out',
                        description: `Game timed out! Auto cashed out at **${multiplier.toFixed(2)}x** for **$${winnings.toLocaleString()}**.`,
                        color: 'success'
                    });
                    embed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
                    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
                } else {
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += bet;
                    await setEconomyData(client, guildId, userId, fresh);
                    await interaction.editReply({
                        embeds: [createEmbed({ title: '⏰ Mines — Timed Out', description: 'No picks were made — your bet has been refunded.', color: 'info' })],
                        components: []
                    }).catch(() => {});
                }
            });

        } catch (error) {
            logger.error('[mines] Error:', error);
            const reply = { embeds: [createEmbed({ title: '❌ Error', description: 'Something went wrong starting the game. Please try again.', color: 'error' })], flags: 64 };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply).catch(() => {});
            } else {
                await interaction.reply(reply).catch(() => {});
            }
        }
    }
};
