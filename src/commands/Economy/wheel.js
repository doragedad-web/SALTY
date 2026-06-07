import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const WHEEL = [
    { label: '💀 Bankrupt', multiplier: 0, weight: 5 },
    { label: '❌ Lose', multiplier: 0, weight: 15 },
    { label: '0.5x', multiplier: 0.5, weight: 15 },
    { label: '1x', multiplier: 1, weight: 20 },
    { label: '1.5x', multiplier: 1.5, weight: 15 },
    { label: '2x', multiplier: 2, weight: 15 },
    { label: '3x', multiplier: 3, weight: 8 },
    { label: '5x', multiplier: 5, weight: 5 },
    { label: '🎉 10x JACKPOT', multiplier: 10, weight: 2 },
];

function spinWheel() {
    const totalWeight = WHEEL.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const segment of WHEEL) {
        rand -= segment.weight;
        if (rand <= 0) return segment;
    }
    return WHEEL[WHEEL.length - 1];
}

export default {
    data: new SlashCommandBuilder()
        .setName('wheel')
        .setDescription('Spin the prize wheel!')
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

        const segment = spinWheel();
        const winnings = Math.floor(bet * segment.multiplier);
        userData.wallet = (userData.wallet - bet) + winnings;

        await setEconomyData(client, guildId, userId, userData);

        const won = segment.multiplier >= 1;
        const embed = won
            ? successEmbed('🎡 Wheel Spin', `The wheel landed on **${segment.label}**!\nYou won **$${winnings.toLocaleString()}**!`)
            : errorEmbed('🎡 Wheel Spin', `The wheel landed on **${segment.label}**!\n${segment.multiplier === 0.5 ? `You got back $${winnings.toLocaleString()}.` : `You lost **$${bet.toLocaleString()}**.`}`);

        embed.addFields({ name: '💵 New Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
        embed.setFooter({ text: 'Possible: Bankrupt | Lose | 0.5x | 1x | 1.5x | 2x | 3x | 5x | 10x' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'wheel' })
};
