mport { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed, createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

function generateCrashPoint() {
    const r = Math.random();
    if (r < 0.4) return +(1 + Math.random()).toFixed(2);
    if (r < 0.7) return +(2 + Math.random() * 3).toFixed(2);
    if (r < 0.9) return +(5 + Math.random() * 5).toFixed(2);
    return +(10 + Math.random() * 90).toFixed(2);
}

export default {
    data: new SlashCommandBuilder()
        .setName('crash')
        .setDescription('Bet on a rising multiplier — cash out before it crashes!')
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

        const crashPoint = generateCrashPoint();
        const steps = [1.2, 1.5, 2.0, 3.0, 5.0, 10.0].filter(s => s < crashPoint);

        userData.wallet -= bet;
        await setEconomyData(client, guildId, userId, userData);

        let currentMultiplier = 1.0;
        let cashedOut = false;

        const cashOutBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('crash_cashout').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success)
        );

        const embed = createEmbed({
            title: '📈 Crash',
            description: `Multiplier: **1.00x** 🚀\nBet: **$${bet.toLocaleString()}**\n\nClick **Cash Out** before it crashes!`,
        });

        const msg = await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [cashOutBtn] });

        const tick = async () => {
            for (const step of steps) {
                if (cashedOut) return;
                await new Promise(r => setTimeout(r, 2000));
                if (cashedOut) return;
                currentMultiplier = step;

                const updated = createEmbed({
                    title: '📈 Crash',
                    description: `Multiplier: **${step.toFixed(2)}x** 🚀\nBet: **$${bet.toLocaleString()}**\nPotential win: **$${Math.floor(bet * step).toLocaleString()}**\n\nClick **Cash Out** before it crashes!`,
                });
                await interaction.editReply({ embeds: [updated], components: [cashOutBtn] }).catch(() => {});
            }

            if (!cashedOut) {
                await new Promise(r => setTimeout(r, 2000));
                if (!cashedOut) {
                    cashedOut = true;
                    const crashEmbed = errorEmbed('💥 Crashed!', `The multiplier crashed at **${crashPoint.toFixed(2)}x**!\nYou lost **$${bet.toLocaleString()}**.`);
                    crashEmbed.addFields({ name: '💵 Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
                    await interaction.editReply({ embeds: [crashEmbed], components: [] }).catch(() => {});
                }
            }
        };

        tick();

        if (msg) {
            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i => i.user.id === userId && i.customId === 'crash_cashout',
                time: (steps.length + 2) * 2000 + 1000,
                max: 1
            });

            collector.on('collect', async i => {
                if (cashedOut) return;
                cashedOut = true;
                const winnings = Math.floor(bet * currentMultiplier);
                const fresh = await getEconomyData(client, guildId, userId);
                fresh.wallet += winnings;
                await setEconomyData(client, guildId, userId, fresh);
                const winEmbed = successEmbed('💰 Cashed Out!', `You cashed out at **${currentMultiplier.toFixed(2)}x** and won **$${winnings.toLocaleString()}**!\nThe crash point was **${crashPoint.toFixed(2)}x**.`);
                winEmbed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
                await i.update({ embeds: [winEmbed], components: [] }).catch(() => {});
            });
        }
    }, { command: 'crash' })
};
