import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';

const HUDLABS_REVIEW_URL = 'https://YOUR-HUDLABS-REVIEW-LINK-HERE';

export default {
  slashOnly: true,

  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Send the HudLabs review prompt.')
    .addStringOption(option =>
      option
        .setName('product')
        .setDescription('Optional product/asset name')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('order')
        .setDescription('Optional order ID')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (HUDLABS_REVIEW_URL.includes('YOUR-HUDLABS-REVIEW-LINK-HERE')) {
      return interaction.reply({
        content:
          'The HudLabs review URL has not been configured. Set HUDLABS_REVIEW_URL in this file first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const product = interaction.options.getString('product');
    const order = interaction.options.getString('order');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⭐ Leave a HudLabs Review')
      .setDescription(
        `Thanks for your purchase${product ? ` of **${product}**` : ''}!\n\n` +
        'If you have a moment, please leave us a quick review on HudLabs. ' +
        'Your feedback helps us improve and helps other customers.\n\n' +
        '⭐ ⭐ ⭐ ⭐ ⭐'
      )
      .addFields(
        {
          name: 'Purchase',
          value: product || 'Your recent purchase',
          inline: true,
        },
        {
          name: 'Customer',
          value: interaction.user.toString(),
          inline: true,
        },
        ...(order
          ? [{ name: 'Order', value: order, inline: true }]
          : [])
      )
      .setFooter({
        text: 'HudLabs Reviews • Thank you for your support!',
      });

    const button = new ButtonBuilder()
      .setLabel('Leave a Review')
      .setEmoji('⭐')
      .setStyle(ButtonStyle.Link)
      .setURL(HUDLABS_REVIEW_URL);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
