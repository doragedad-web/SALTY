import { EmbedBuilder } from 'discord.js';
import { activeTheme } from './theme.js';

export function createEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(options.color || activeTheme.primary)
    .setTitle(options.title || null)
    .setDescription(options.description || null)
    .setTimestamp();

  if (options.fields) embed.addFields(options.fields);

  if (options.footer)
    embed.setFooter({
      text: options.footer.text,
      iconURL: options.footer.icon || null,
    });

  if (options.author)
    embed.setAuthor({
      name: options.author.name,
      iconURL: options.author.icon || null,
    });

  return embed;
}
