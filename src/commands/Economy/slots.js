import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎'];
const COOLDOWN = 3 * 60 * 1000;

function spin() {
    return [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
}

function getPayout(reels, bet) {
    const [a, b, c] = reels;
    if (a === b && b === c) {
        if (a === '💎') return { multiplier: 10, label: '💎 JACKPOT! 💎' };
        if (a === '⭐') return { multiplier: 5, label: '⭐ Big Win! ⭐' };
        return { multiplier: 3, label: '🎉 Winner!' };
    }
    if (a === b || b === c || a === c) return { multiplier: 1.5, label: '✨ Small Win!' };
    return { multiplier: 0, label: '💔 No Match' };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Spin the slot machine!')
        .addIntegerOption(option =>
            option.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const bet = interaction.options.getInteger('amount');
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        if (now < (userData.lastSlots || 0) + COOLDOWN) {
            const remaining = (userData.lastSlots + COOLDOWN) - now;
            const secs = Math.ceil(remaining / 1000);
            throw createError('Slots cooldown', ErrorTypes.RATE_LIMIT, `You need to wait **${secs}s** before spinning again.`, { cooldownType: 'slots' });
        }

        if (userData.wallet < bet) {
            throw createError('Insufficient funds', ErrorTypes.VALIDATION, `You only have **$${userData.wallet.toLocaleString()}** in your wallet.`);
        }

        const reels = spin();
        const { multiplier, label } = getPayout(reels, bet);
        const display = `[ ${reels.join(' | ')} ]`;

        let winnings = 0;
        if (multiplier > 0) {
            winnings = Math.floor(bet * multiplier);
            userData.wallet = (userData.wallet - bet) + winnings;
        } else {
            userData.wallet -= bet;
        }

        userData.lastSlots = now;
        await setEconomyData(client, guildId, userId, userData);

        const embed = multiplier > 0
            ? successEmbed('🎰 Slot Machine', `${display}\n\n${label}\nYou won **$${winnings.toLocaleString()}**!`)
            : errorEmbed('🎰 Slot Machine', `${display}\n\n${label}\nYou lost **$${bet.toLocaleString()}**.`);

        embed.addFields({ name: '💵 New Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
        embed.setFooter({ text: 'Cooldown: 3 minutes' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'slots' })
};

