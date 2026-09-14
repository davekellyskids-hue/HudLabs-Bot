import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
 
const REVIEW_REQUEST_TTL = 7 * 24 * 60 * 60;
const REVIEW_REQUEST_PREFIX = 'temp:hudlabs_review_request:';
 
function requestKey(token) {
    return `${REVIEW_REQUEST_PREFIX}${token}`;
}
 
const FILLED_STAR = '\u2B50'; // ⭐
const EMPTY_STAR = '\u2606'; // ☆
 
function starsFromAverage(average) {
    const rounded = Math.max(0, Math.min(5, Math.round(average)));
    return FILLED_STAR.repeat(rounded) + EMPTY_STAR.repeat(5 - rounded);
}
 
async function getStoreRating(client, guildId) {
    let list = [];
 
    try {
        const reviews = await client.db.get(`temp:hudlabs_reviews:${guildId}`, []);
        list = Array.isArray(reviews) ? reviews : [];
    } catch (error) {
        list = [];
    }
 
    const count = list.length;
    const average = count
        ? list.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count
        : 0;
 
    return { average, count, stars: starsFromAverage(average) };
}
 
export default {
    slashOnly: true,
 
    data: new SlashCommandBuilder()
        .setName('review')
        .setDescription('HudLabs customer reviews')
 
        .addSubcommand(subcommand =>
            subcommand
                .setName('request')
                .setDescription('Privately DM a customer for a review')
 
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The customer')
                        .setRequired(true)
                )
 
                .addStringOption(option =>
                    option
                        .setName('product')
                        .setDescription('Product / asset pack name')
                        .setRequired(true)
                )
 
                .addStringOption(option =>
                    option
                        .setName('price')
                        .setDescription('Price paid, e.g. 3,500 R$')
                        .setRequired(true)
                )
 
                .addStringOption(option =>
                    option
                        .setName('order')
                        .setDescription('Order ID')
                        .setRequired(true)
                )
        )
 
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show HudLabs review statistics')
        ),
 
    category: 'Community',
 
    async execute(interaction, guildConfig, client) {
        const subcommand =
            interaction.options.getSubcommand();
 
        await interaction.deferReply({ ephemeral: true });
 
        if (subcommand === 'request') {
            const customer =
                interaction.options.getUser('user');
 
            const product =
                interaction.options.getString('product');
 
            const price =
                interaction.options.getString('price');
 
            const order =
                interaction.options.getString('order');
 
            const token =
                randomBytes(12).toString('hex');
 
            try {
                await client.db.set(
                    requestKey(token),
                    {
                        token,
                        guildId: interaction.guildId,
                        userId: customer.id,
                        product,
                        price,
                        order,
                        requestedBy: interaction.user.id,
                        createdAt:
                            new Date().toISOString(),
                    },
                    REVIEW_REQUEST_TTL
                );
            } catch (error) {
                return interaction.editReply({
                    content:
                        '❌ Something went wrong saving the review request. Please try again.',
                });
            }
 
            try {
                const storeRating = await getStoreRating(client, interaction.guildId);
 
                const embed =
                    new EmbedBuilder()
                        .setColor(0xf2c94c)
 
                        .setAuthor({
                            name:
                                `${customer.globalName || customer.username} (@${customer.username})`,
                            iconURL: customer.displayAvatarURL?.(),
                        })
 
                        .setDescription([
                            `${customer}`,
                            '',
                            '✅ **Verified Purchase**',
                            '',
                            '│ No written review left.',
                        ].join('\n'))
 
                        .addFields(
                            {
                                name: 'Pack',
                                value: product,
                                inline: true,
                            },
                            {
                                name: 'Paid',
                                value: price,
                                inline: true,
                            },
                            {
                                name: 'Order',
                                value: order,
                                inline: true,
                            },
                            {
                                name: 'Store rating',
                                value:
                                    `${storeRating.stars} ${storeRating.average.toFixed(1)} from ` +
                                    `${storeRating.count} review${storeRating.count === 1 ? '' : 's'}`,
                                inline: false,
                            },
                        )
 
                        .setFooter({
                            text: 'HudLabs • ✅',
                        })
 
                        .setTimestamp();
 
                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `hudlabs_review:${token}`
                                )
                                .setLabel(
                                    'Leave a Review'
                                )
                                .setEmoji('⭐')
                                .setStyle(
                                    ButtonStyle.Primary
                                )
                        );
 
                await customer.send({
                    content:
                        `Hey ${customer}! 👋\n\n` +
                        `Thank you for purchasing from **HudLabs**! ` +
                        `We'd really appreciate it if you could take a moment to leave us a review. ⭐`,
 
                    embeds: [embed],
 
                    components: [row],
                });
 
            } catch (error) {
 
                await client.db
                    .delete(requestKey(token))
                    .catch(() => {});
 
                return interaction.editReply({
                    content:
                        `❌ I couldn't DM ${customer}. ` +
                        `They may have their DMs disabled or blocked the bot.`,
                });
            }
 
            return interaction.editReply({
                content:
                    `✅ Review request privately sent to ${customer}.`,
            });
        }
 
        if (subcommand === 'stats') {
 
            let storeRating;
 
            try {
                storeRating = await getStoreRating(client, interaction.guildId);
            } catch (error) {
                return interaction.editReply({
                    content:
                        '❌ Something went wrong fetching review stats. Please try again.',
                });
            }
 
            return interaction.editReply({
                content:
                    `${storeRating.stars} HudLabs rating: **${storeRating.average.toFixed(1)}/5.0** ` +
                    `from **${storeRating.count}** review${storeRating.count === 1 ? '' : 's'}.`,
            });
        }
    },
};
 
export { requestKey };
