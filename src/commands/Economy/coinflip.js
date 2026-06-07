import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin and bet on the outcome!')
        .addStringOption(option =>
            option.setName('choice').setDescription('Heads or Tails?').setRequired(true)
                .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
        )
        .addIntegerOption(option =>
            option.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const choice = interaction.options.getString('choice');
        const bet = interaction.options.getInteger('amount');

        const userData = await getEconomyData(client, guildId, userId);

        if (userData.wallet < bet) {
            throw createError('Insufficient funds', ErrorTypes.VALIDATION, `You only have **$${userData.wallet.toLocaleString()}** in your wallet.`);
        }

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = result === choice;
        const emoji = result === 'heads' ? '🪙 Heads' : '🌑 Tails';

        if (won) {
            userData.wallet += bet;
        } else {
            userData.wallet -= bet;
        }

        await setEconomyData(client, guildId, userId, userData);

        const embed = won
            ? successEmbed('🪙 Coin Flip', `The coin landed on **${emoji}**!\nYou guessed correctly and won **$${bet.toLocaleString()}**!`)
            : errorEmbed('🪙 Coin Flip', `The coin landed on **${emoji}**!\nYou guessed wrong and lost **$${bet.toLocaleString()}**.`);

        embed.addFields({ name: '💵 New Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'coinflip' })
};
