export async function loadingSteps(interaction, steps = []) {
  await interaction.deferReply();

  let msg = "⏳ Starting...\n";
  await interaction.editReply(msg);

  for (const step of steps) {
    await new Promise(r => setTimeout(r, 800));
    msg += `\n✔️ ${step}`;
    await interaction.editReply(msg);
  }

  await interaction.editReply("✅ Done!");
}

export async function fakeTypingReply(interaction, text, delay = 800) {
  await interaction.deferReply();

  await new Promise(r => setTimeout(r, delay));

  await interaction.editReply(text);
}
