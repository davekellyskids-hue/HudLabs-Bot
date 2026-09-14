import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';

const REVIEW_DB_KEY = (guildId) => `hudlabs:reviews:${guildId}`;

/**
 * Get all HudLabs reviews
 */
async function getReviews(client, guildId) {
    try {
        const data = await client.db.get(
            REVIEW_DB_KEY(guildId),
            []
        );

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Failed to get HudLabs reviews:', error);
        return [];
    }
}

/**
 * Save HudLabs reviews
 */
async function saveReviews(client, guildId, reviews) {
    await client.db.set(
        REVIEW_DB_KEY(guildId),
        reviews
    );
}

/**
 * Calculate store rating
 */
function getRating(reviews) {
    if (!reviews.length) {
        return '0.0';
    }

    const total = reviews.reduce(
        (sum, review) =>
            sum + Number(review.rating || 0),
        0
    );

    return (total / reviews.length).toFixed(1);
}

/**
 * Create star display
 */
function stars(rating) {
    const number = Math.max(
        0,
        Math.min(5, Math.round(Number(rating) || 0))
    );

    return '⭐'.repeat(number) +
        '☆'.repeat(5 - number);
}

/**
 * Create the HudLabs review card
 */
function buildReviewEmbed({
    user,
    product,
    price,
    order,
    rating,
    reviewCount,
    writtenReview,
}) {
    const hasReview = Boolean(writtenReview);

    const displayName =
        user.globalName || user.username;

    const embed = new EmbedBuilder()
        .setColor(0xf2c94c)

        // Arthur (@ArthurDevelops)
        .setAuthor({
            name: `${displayName} (@${user.username})`,
        })

        .setDescription(
            [
                // Actual clickable Discord mention
                `${user}`,

                '',

                '💚 **Verified Purchase**',

                '',

                hasReview
                    ? `> ${writtenReview}`
                    : '│ No written review left.',
            ].join('\n')
        )

        .addFields(
            {
                name: 'Pack',
                value: product || 'Asset Pack',
                inline: true,
            },

            {
                name: 'Paid',
                value: price || 'Paid',
                inline: true,
            },

            {
                name: 'Order',
                value: order || 'N/A',
                inline: false,
            },

            {
                name: 'Store rating',
                value:
                    `${stars(rating)} ${rating} from ${reviewCount} review${reviewCount === 1 ? '' : 's'}`,
                inline: false,
            }
        )

        .setFooter({
            text:
                `HudLabs • ${hasReview ? '✓' : 'No written review left'} • ` +
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                }),
        });

    return embed;
}

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('review')
        .setDescription('HudLabs customer reviews')

        /*
         * /review request
         */
        .addSubcommand(subcommand =>
            subcommand
                .setName('request')
                .setDescription(
                    'Send a HudLabs review request'
                )

                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription(
                            'The customer who purchased the product'
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName('product')
                        .setDescription(
                            'Product / asset pack name'
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName('price')
                        .setDescription(
                            'Price paid, e.g. 3,500 R$'
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName('order')
                        .setDescription(
                            'Order ID'
                        )
                        .setRequired(true)
                )
        )

        /*
         * /review stats
         */
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription(
                    'Show HudLabs review statistics'
                )
        ),

    category: 'Community',

    async execute(interaction) {

        const subcommand =
            interaction.options.getSubcommand();

        /*
         * ==========================================
         * /review request
         * ==========================================
         */

        if (subcommand === 'request') {

            const customer =
                interaction.options.getUser('user');

            const product =
                interaction.options.getString('product');

            const price =
                interaction.options.getString('price');

            const order =
                interaction.options.getString('order');

            const reviews =
                await getReviews(
                    interaction.client,
                    interaction.guildId
                );

            /*
             * Check whether this customer
             * already reviewed this order.
             */

            const existingReview =
                reviews.find(review =>
                    review.userId === customer.id &&
                    review.order === order
                );

            const rating =
                getRating(reviews);

            /*
             * Create the card
             */

            const embed =
                buildReviewEmbed({
                    user: customer,
                    product,
                    price,
                    order,
                    rating,
                    reviewCount: reviews.length,
                    writtenReview:
                        existingReview?.comment,
                });

            /*
             * Review button
             */

            const button =
                new ButtonBuilder()
                    .setCustomId(
                        `hudlabs_write_review:${customer.id}:${order}`
                    )
                    .setLabel(
                        existingReview
                            ? 'Edit Review'
                            : 'Leave a Review'
                    )
                    .setEmoji('⭐')
                    .setStyle(
                        existingReview
                            ? ButtonStyle.Secondary
                            : ButtonStyle.Primary
                    );

            const row =
                new ActionRowBuilder()
                    .addComponents(button);

            /*
             * Send review card
             */

            await interaction.reply({
                content: `${customer}`,
                embeds: [embed],
                components: [row],
            });

            const message =
                await interaction.fetchReply();

            /*
             * Button collector
             */

            const collector =
                message.createMessageComponentCollector({
                    time: 24 * 60 * 60 * 1000,
                });

            collector.on(
                'collect',
                async buttonInteraction => {

                    const parts =
                        buttonInteraction.customId
                            .split(':');

                    const customerId =
                        parts[1];

                    const orderId =
                        parts.slice(2).join(':');

                    /*
                     * Make sure the correct customer
                     * is clicking the button.
                     */

                    if (
                        buttonInteraction.user.id !==
                        customerId
                    ) {
                        return buttonInteraction.reply({
                            content:
                                '❌ This review request belongs to another customer.',
                            ephemeral: true,
                        });
                    }

                    /*
                     * Create review modal
                     */

                    const modal =
                        new ModalBuilder()
                            .setCustomId(
                                `hudlabs_review_modal:${customerId}:${orderId}`
                            )
                            .setTitle(
                                'HudLabs Review'
                            );

                    /*
                     * Rating input
                     */

                    const ratingInput =
                        new TextInputBuilder()
                            .setCustomId('rating')
                            .setLabel(
                                'Rating (1-5)'
                            )
                            .setPlaceholder(
                                '5'
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setRequired(true)
                            .setMaxLength(1);

                    /*
                     * Comment input
                     */

                    const commentInput =
                        new TextInputBuilder()
                            .setCustomId(
                                'comment'
                            )
                            .setLabel(
                                'Your review'
                            )
                            .setPlaceholder(
                                'Tell us what you thought about your purchase...'
                            )
                            .setStyle(
                                TextInputStyle.Paragraph
                            )
                            .setRequired(true)
                            .setMaxLength(1000);

                    modal.addComponents(

                        new ActionRowBuilder()
                            .addComponents(
                                ratingInput
                            ),

                        new ActionRowBuilder()
                            .addComponents(
                                commentInput
                            )
                    );

                    await buttonInteraction.showModal(
                        modal
                    );

                    try {

                        const submitted =
                            await buttonInteraction
                                .awaitModalSubmit({
                                    time:
                                        5 * 60 * 1000,

                                    filter: i =>
                                        i.user.id ===
                                            customerId &&
                                        i.customId ===
                                            `hudlabs_review_modal:${customerId}:${orderId}`,
                                });

                        /*
                         * Get rating
                         */

                        const ratingNumber =
                            Number(
                                submitted.fields.getTextInputValue(
                                    'rating'
                                )
                            );

                        /*
                         * Get comment
                         */

                        const comment =
                            submitted.fields
                                .getTextInputValue(
                                    'comment'
                                )
                                .trim();

                        /*
                         * Validate rating
                         */

                        if (
                            !Number.isInteger(
                                ratingNumber
                            ) ||
                            ratingNumber < 1 ||
                            ratingNumber > 5
                        ) {

                            return submitted.reply({
                                content:
                                    '❌ Your rating must be between 1 and 5.',
                                ephemeral: true,
                            });
                        }

                        /*
                         * Load latest reviews
                         */

                        const currentReviews =
                            await getReviews(
                                interaction.client,
                                interaction.guildId
                            );

                        /*
                         * Check for existing review
                         */

                        const existingIndex =
                            currentReviews.findIndex(
                                review =>
                                    review.userId ===
                                        customerId &&
                                    review.order ===
                                        orderId
                            );

                        /*
                         * Create review
                         */

                        const reviewData = {
                            userId:
                                customerId,

                            username:
                                customer.username,

                            product:
                                product,

                            price:
                                price,

                            order:
                                orderId,

                            rating:
                                ratingNumber,

                            comment:
                                comment,

                            createdAt:
                                new Date()
                                    .toISOString(),
                        };

                        /*
                         * Update existing review
                         * or create a new one.
                         */

                        if (
                            existingIndex >= 0
                        ) {

                            currentReviews[
                                existingIndex
                            ] = reviewData;

                        } else {

                            currentReviews.push(
                                reviewData
                            );
                        }

                        /*
                         * Save reviews
                         */

                        await saveReviews(
                            interaction.client,
                            interaction.guildId,
                            currentReviews
                        );

                        /*
                         * Calculate new store rating
                         */

                        const newRating =
                            getRating(
                                currentReviews
                            );

                        /*
                         * Build updated card
                         */

                        const updatedEmbed =
                            buildReviewEmbed({
                                user: customer,
                                product,
                                price,
                                order: orderId,
                                rating:
                                    newRating,
                                reviewCount:
                                    currentReviews.length,
                                writtenReview:
                                    comment,
                            });

                        /*
                         * Change button to Edit Review
                         */

                        const updatedButton =
                            new ButtonBuilder()
                                .setCustomId(
                                    `hudlabs_write_review:${customerId}:${orderId}`
                                )
                                .setLabel(
                                    'Edit Review'
                                )
                                .setEmoji('⭐')
                                .setStyle(
                                    ButtonStyle.Secondary
                                );

                        /*
                         * Update the original
                         * Discord review card.
                         */

                        await interaction.editReply({
                            embeds: [
                                updatedEmbed,
                            ],

                            components: [
                                new ActionRowBuilder()
                                    .addComponents(
                                        updatedButton
                                    ),
                            ],
                        });

                        /*
                         * Confirmation
                         */

                        await submitted.reply({
                            content:
                                '✅ Thanks! Your HudLabs review has been saved.',
                            ephemeral: true,
                        });

                    } catch (error) {

                        /*
                         * Modal timed out.
                         */

                        console.log(
                            'HudLabs review modal timed out.'
                        );
                    }
                }
            );

            return;
        }

        /*
         * ==========================================
         * /review stats
         * ==========================================
         */

        if (subcommand === 'stats') {

            const reviews =
                await getReviews(
                    interaction.client,
                    interaction.guildId
                );

            const rating =
                getRating(reviews);

            const embed =
                new EmbedBuilder()
                    .setColor(0xf2c94c)
                    .setTitle(
                        '⭐ HudLabs Store Reviews'
                    )
                    .setDescription(
                        `${stars(rating)} **${rating}/5.0**\n\n` +
                        `Based on **${reviews.length}** review${reviews.length === 1 ? '' : 's'}.`
                    );

            return interaction.reply({
                embeds: [embed],
            });
        }
    },
};
