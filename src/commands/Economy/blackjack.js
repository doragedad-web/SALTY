import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed, createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
    const deck = [];
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
    return deck.sort(() => Math.random() - 0.5);
}

function cardValue(rank) {
    if (['J', 'Q', 'K'].includes(rank)) return 10;
    if (rank === 'A') return 11;
    return parseInt(rank);
}

function handValue(hand) {
    let total = hand.reduce((sum, c) => sum + cardValue(c.rank), 0);
    let aces = hand.filter(c => c.rank === 'A').length;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

function formatHand(hand, hideSecond = false) {
    if (hideSecond) return `${hand[0].rank}${hand[0].suit} | ??`;
    return hand.map(c => `${c.rank}${c.suit}`).join(' ');
}

export default {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play a game of Blackjack! Get closer to 21 than the dealer.')
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

        const deck = createDeck();
        const playerHand = [deck.pop(), deck.pop()];
        const dealerHand = [deck.pop(), deck.pop()];

        userData.wallet -= bet;
        await setEconomyData(client, guildId, userId, userData);

        const buildEmbed = (hideDealer = true, extraNote = '') => createEmbed({
            title: '🃏 Blackjack',
            description: `**Your hand:** ${formatHand(playerHand)} — **${handValue(playerHand)}**\n**Dealer:** ${hideDealer ? formatHand(dealerHand, true) : formatHand(dealerHand)} — **${hideDealer ? cardValue(dealerHand[0].rank) : handValue(dealerHand)}**\n\nBet: **$${bet.toLocaleString()}**${extraNote ? `\n${extraNote}` : ''}`,
        });

        const buttons = (disabled = false) => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bj_hit').setLabel('👊 Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('bj_stand').setLabel('🛑 Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        );

        if (handValue(playerHand) === 21) {
            const winnings = Math.floor(bet * 2.5);
            const fresh = await getEconomyData(client, guildId, userId);
            fresh.wallet += winnings;
            await setEconomyData(client, guildId, userId, fresh);
            const bj = successEmbed('🃏 Blackjack!', `**Blackjack!** You got 21 and win **$${winnings.toLocaleString()}**! (2.5x)`);
            bj.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
            return await InteractionHelper.safeEditReply(interaction, { embeds: [bj], components: [] });
        }

        const msg = await InteractionHelper.safeEditReply(interaction, { embeds: [buildEmbed()], components: [buttons()] });
        if (!msg) return;

        let gameOver = false;

        const endGame = async (i, updateFn) => {
            gameOver = true;
            collector.stop();

            while (handValue(dealerHand) < 17) dealerHand.push(deck.pop());

            const playerTotal = handValue(playerHand);
            const dealerTotal = handValue(dealerHand);

            let resultEmbed;
            const fresh = await getEconomyData(client, guildId, userId);

            if (dealerTotal > 21 || playerTotal > dealerTotal) {
                fresh.wallet += bet * 2;
                resultEmbed = successEmbed('🃏 Blackjack — You Win!', `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer:** ${formatHand(dealerHand)} (${dealerTotal})\n\nYou won **$${(bet * 2).toLocaleString()}**!`);
            } else if (playerTotal === dealerTotal) {
                fresh.wallet += bet;
                resultEmbed = createEmbed({ title: '🃏 Blackjack — Push', description: `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer:** ${formatHand(dealerHand)} (${dealerTotal})\n\nTie — bet returned.` });
            } else {
                resultEmbed = errorEmbed('🃏 Blackjack — You Lose', `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer:** ${formatHand(dealerHand)} (${dealerTotal})\n\nYou lost **$${bet.toLocaleString()}**.`);
            }

            await setEconomyData(client, guildId, userId, fresh);
            resultEmbed.addFields({ name: '💵 New Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
            await updateFn({ embeds: [resultEmbed], components: [] });
        };

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.user.id === userId,
            time: 5 * 60 * 1000
        });

        collector.on('collect', async i => {
            if (gameOver) return;

            if (i.customId === 'bj_hit') {
                playerHand.push(deck.pop());
                const total = handValue(playerHand);

                if (total > 21) {
                    gameOver = true;
                    collector.stop();
                    const fresh = await getEconomyData(client, guildId, userId);
                    const bust = errorEmbed('💥 Bust!', `**Your hand:** ${formatHand(playerHand)} — **${total}**\nYou went over 21 and lost **$${bet.toLocaleString()}**.`);
                    bust.addFields({ name: '💵 Balance', value: `$${fresh.wallet.toLocaleString()}`, inline: true });
                    await i.update({ embeds: [bust], components: [] });
                    return;
                }

                await i.update({ embeds: [buildEmbed(true, total === 21 ? '21! Standing automatically.' : '')], components: [buttons(total === 21)] });

                if (total === 21) await endGame(i, opts => interaction.editReply(opts).catch(() => {}));
            }

            if (i.customId === 'bj_stand') {
                await endGame(i, opts => i.update(opts));
            }
        });

        collector.on('end', async (_, reason) => {
            if (!gameOver && reason === 'time') {
                const fresh = await getEconomyData(client, guildId, userId);
                fresh.wallet += bet;
                await setEconomyData(client, guildId, userId, fresh);
                await interaction.editReply({ embeds: [errorEmbed('⏰ Timed Out', 'Game timed out. Your bet was refunded.')], components: [] }).catch(() => {});
            }
        });
    }, { command: 'blackjack' })
};
};
