import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

export default {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Spin the roulette wheel!')
        .addStringOption(option =>
            option.setName('bet').setDescription('What to bet on: red, black, green, or a number (0-36)').setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const betInput = interaction.options.getString('bet').toLowerCase().trim();
        const betAmount = interaction.options.getInteger('amount');

        const validBets = ['red', 'black', 'green'];
        const numberBet = parseInt(betInput);
        const isNumberBet = !isNaN(numberBet) && numberBet >= 0 && numberBet <= 36;

        if (!validBets.includes(betInput) && !isNumberBet) {
            throw createError('Invalid bet', ErrorTypes.VALIDATION, 'Bet must be **red**, **black**, **green**, or a number from **0-36**.');
        }

        const userData = await getEconomyData(client, guildId, userId);

        if (userData.wallet < betAmount) {
            throw createError('Insufficient funds', ErrorTypes.VALIDATION, `You only have **$${userData.wallet.toLocaleString()}** in your wallet.`);
        }

        const result = Math.floor(Math.random() * 37);
        let resultColor = result === 0 ? 'green' : RED.includes(result) ? 'red' : 'black';
        const colorEmoji = { red: '🔴', black: '⚫', green: '🟢' };

        let won = false;
        let multiplier = 0;

        if (isNumberBet) {
            won = result === numberBet;
            multiplier = 35;
        } else if (betInput === 'green') {
            won = result === 0;
            multiplier = 14;
        } else {
            won = resultColor === betInput;
            multiplier = 2;
        }

        let winnings = 0;
        if (won) {
            winnings = Math.floor(betAmount * multiplier);
            userData.wallet = (userData.wallet - betAmount) + winnings;
        } else {
            userData.wallet -= betAmount;
        }

        await setEconomyData(client, guildId, userId, userData);

        const resultStr = `The ball landed on **${colorEmoji[resultColor]} ${result}**`;
        const embed = won
            ? successEmbed('🎡 Roulette', `${resultStr}\n\nYou bet on **${betInput}** and won **$${winnings.toLocaleString()}**! (${multiplier}x)`)
            : errorEmbed('🎡 Roulette', `${resultStr}\n\nYou bet on **${betInput}** and lost **$${betAmount.toLocaleString()}**.`);

        embed.addFields({ name: '💵 New Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
        embed.setFooter({ text: 'Payouts: Red/Black 2x | Green 14x | Number 35x' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'roulette' })
};
