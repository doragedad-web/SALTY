import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Roll a dice! Guess higher or lower than the bot.')
        .addStringOption(option =>
            option.setName('choice').setDescription('Will you roll higher or lower than the bot?').setRequired(true)
                .addChoices({ name: 'Higher', value: 'higher' }, { name: 'Lower', value: 'lower' })
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

        const playerRoll = Math.floor(Math.random() * 6) + 1;
        const botRoll = Math.floor(Math.random() * 6) + 1;

        let won = false;
        if (choice === 'higher' && playerRoll > botRoll) won = true;
        if (choice === 'lower' && playerRoll < botRoll) won = true;
        const tie = playerRoll === botRoll;

        if (tie) {
            await setEconomyData(client, guildId, userId, userData);
            const embed = errorEmbed('🎲 Dice Roll', `You rolled **${playerRoll}**, bot rolled **${botRoll}**.\n**It's a tie!** Your bet is returned.`);
            embed.addFields({ name: '💵 Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (won) {
            userData.wallet += bet;
        } else {
            userData.wallet -= bet;
        }

        await setEconomyData(client, guildId, userId, userData);

        const embed = won
            ? successEmbed('🎲 Dice Roll', `You rolled **${playerRoll}**, bot rolled **${botRoll}**.\nYou rolled ${choice} and won **$${bet.toLocaleString()}**!`)
            : errorEmbed('🎲 Dice Roll', `You rolled **${playerRoll}**, bot rolled **${botRoll}**.\nYou lost **$${bet.toLocaleString()}**.`);

        embed.addFields({ name: '💵 New Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'dice' })
};
