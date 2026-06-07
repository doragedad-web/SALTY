import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed, createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

function getMultiplier(streak) {
    return +(1 + streak * 0.5).toFixed(2);
}

export default {
    data: new SlashCommandBuilder()
        .setName('higherlower')
        .setDescription('Guess if the next card is higher or lower — build a streak for bigger wins!')
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

        userData.wallet -= bet;
        await setEconomyData(client, guildId, userId, userData);

        let currentCard = Math.floor(Math.random() * 13) + 1;
        let streak = 0;
        let gameOver = false;

        const cardName = (n) => {
            const names = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };
            return names[n] || String(n);
        };

        const buildComponents = (disabled = false) => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('hl_higher').setLabel('⬆️ Higher').setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('hl_lower').setLabel('⬇️ Lower').setStyle(ButtonStyle.Danger).setDisabled(disabled),
            new ButtonBuilder().setCustomId('hl_cashout').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success).setDisabled(disabled || streak === 0)
        );

        const buildEmbed = () => createEmbed({
            title: '🃏 Higher or Lower',
            description: `Current card: **${cardName(currentCard)}** (${currentCard})\n\nStreak: **${streak}** | Multiplier: **${getMultiplier(streak)}x**\nPotential win: **$${Math.floor(bet * getMultiplier(streak)).toLocaleString()}**\n\nIs the next card higher or lower?`,
        });

        const msg = await InteractionHelper.safeEditReply(interaction, {
            embeds: [buildEmbed()],
            components: [buildComponents()]
        });

        if (!msg) return;

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.user.id === userId,
            time: 5 * 60 * 1000
        });

        collector.on('collect', async i => {
            if (gameOver) return;

            if (i.customId === 'hl_cashout') {
                gameOver = true;
                collector.stop();
                const multiplier = getMultiplier(streak);
                const winnings = Math.floor(bet * multiplier);
                const fresh = await getEconomyData(client, guildId, userId);
                fresh.wallet += winnings;
                await setEconomyData(client, guildId, userId, fresh);
                const winEmbed = successEmbed('💰 Cashed Out!', `You cashed out at a **${streak} streak** (${multiplier}x) and won **$${winnings.toLocaleString()}**!`);
                winEmbed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
                await i.update({ embeds: [winEmbed], components: [] });
                return;
            }

            const nextCard = Math.floor(Math.random() * 13) + 1;
            const guessedHigher = i.customId === 'hl_higher';
            const actuallyHigher = nextCard > currentCard;
            const tie = nextCard === currentCard;

            if (tie) {
                await i.update({ embeds: [createEmbed({ title: '🃏 Higher or Lower', description: `Next card was also **${cardName(nextCard)}** — it's a tie! Try again.` })], components: [buildComponents()] });
                return;
            }

            const correct = guessedHigher === actuallyHigher;

            if (!correct) {
                gameOver = true;
                collector.stop();
                const loseEmbed = errorEmbed('❌ Wrong!', `You guessed **${guessedHigher ? 'Higher' : 'Lower'}** but the next card was **${cardName(nextCard)}** (${nextCard}).\nYou lost **$${bet.toLocaleString()}**. Streak: **${streak}**.`);
                loseEmbed.addFields({ name: '💵 Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
                await i.update({ embeds: [loseEmbed], components: [buildComponents(true)] });
                return;
            }

            streak++;
            currentCard = nextCard;

            await i.update({ embeds: [buildEmbed()], components: [buildComponents()] });
        });

        collector.on('end', async (_, reason) => {
            if (!gameOver && reason === 'time') {
                if (streak > 0) {
                    const multiplier = getMultiplier(streak);
                    const winnings = Math.floor(bet * multiplier);
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += winnings;
                    await setEconomyData(client, guildId, userId, fresh);
                    await interaction.editReply({ embeds: [successEmbed('⏰ Auto Cash Out', `Timed out — auto cashed out at ${multiplier}x for **$${winnings.toLocaleString()}**.`)], components: [] }).catch(() => {});
                } else {
                    const fresh = await getEconomyData(client, guildId, userId);
                    fresh.wallet += bet;
                    await setEconomyData(client, guildId, userId, fresh);
                    await interaction.editReply({ embeds: [errorEmbed('⏰ Timed Out', 'Game timed out. Your bet was refunded.')], components: [] }).catch(() => {});
                }
            }
        });
    }, { command: 'higherlower' })
};
