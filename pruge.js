const { PermissionFlagsBits } = require("discord.js");

module.exports = {
    name: "pruge30",
    description: "Deletes the last 30 messages.",
    
    async execute(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("You need Manage Messages permission.");
        }

        const messages = await message.channel.bulkDelete(30, true);

        message.channel.send(`🗑️ Deleted ${messages.size} messages.`)
            .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
    }
};
