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

const MEMBER_REVIEWS_CHANNEL_ID = '1531866115146514586';

const REVIEW_DB_KEY = (guildId) =>
    `hudlabs:reviews:${guildId}`;

/* ==========================================
   DATABASE
   ========================================== */

async function getReviews(client, guildId) {
    try {
        const data = await client.db.get(
            REVIEW_DB_KEY(guildId),
            []
        );

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error(
            '[HudLabs Reviews] Failed to load reviews:',
            error
        );

        return [];
    }
}

async function saveReviews(client, guildId, reviews) {
    await client.db.set(
        REVIEW_DB_KEY(guildId),
        reviews
    );
}

/* ==========================================
   RATING
   ========================================== */

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

function getStars(rating) {
    const number = Math.max(
        0,
        Math.min(
            5,
            Math.round(Number(rating) || 0)
        )
    );

    return (
        '⭐'.repeat(number) +
        '☆'.repeat(5 - number)
    );
}

/* ==========================================
   REVIEW EMBED
   ========================================== */

function buildReviewEmbed({
    user,
    product,
    price,
    order,
    rating,
    reviewCount,
    comment,
}) {
    const displayName =
        user.globalName || user.username;

    const hasComment =
        Boolean(comment && comment.trim());

    return new EmbedBuilder()
        .setColor(0xf2c94c)

        /*
         * Example:
         *
         * Arthur (@ArthurDevelops)
         */
        .setAuthor({
            name:
                `${displayName} (@${user.username})`,
        })

        /*
         * Actual Discord mention
         */
        .setDescription(
            [
                `${user}`,

                '',

                '💚 **Verified Purchase**',

                '',

                hasComment
                    ? `> ${comment}`
                    : '│ No written review left.',
            ].join('\n')
        )

        .addFields(
            {
                name: 'Pack',
                value:
                    product || 'Asset Pack',
                inline: true,
            },

            {
                name: 'Paid',
                value:
                    price || 'Paid',
                inline: true,
            },

            {
                name: 'Order',
                value:
                    order || 'N/A',
                inline: false,
            },

            {
                name: 'Store rating',
                value:
                    `${getStars(rating)} ${rating} from ${reviewCount} review${reviewCount === 1 ? '' : 's'}`,
                inline: false,
            }
        )

        .setFooter({
            text:
                `HudLabs • ✓ Verified Purchase • ` +
                new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                }),
        });
}

/* ==========================================
   COMMAND
   ========================================== */

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('review')
        .setDescription(
            'HudLabs customer reviews'
        )

        /* ================================
           /review request
           ================================ */

        .addSubcommand(subcommand =>
            subcommand
                .setName('request')
                .setDescription(
                    'Privately DM a customer for a review'
                )

                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription(
                            'The customer'
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName('product')
                        .setDescription(
                            'Product / asset pack'
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

        /* ================================
           /review stats
           ================================ */

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

        /* ==========================================
           /review request
           ========================================== */

        if (subcommand === 'request') {

            const customer =
                interaction.options.getUser(
                    'user'
                );

            const product =
                interaction.options.getString(
                    'product'
                );

            const price =
                interaction.options.getString(
                    'price'
                );

            const order =
                interaction.options.getString(
                    'order'
                );

            const reviews =
                await getReviews(
                    interaction.client,
                    interaction.guildId
                );

            /*
             * Check if this order already
             * has a review.
             */

            const existingReview =
                reviews.find(
                    review =>
                        review.userId ===
                            customer.id &&
                        review.order ===
                            order
                );

            const rating =
                getRating(reviews);

            /*
             * Build initial review card.
             */

            const embed =
                buildReviewEmbed({
                    user: customer,
                    product,
                    price,
                    order,
                    rating,
                    reviewCount:
                        reviews.length,
                    comment:
                        existingReview?.comment,
                });

            /*
             * Button inside DM.
             */

            const button =
                new ButtonBuilder()
                    .setCustomId(
                        `hudlabs_review:${interaction.guildId}:${customer.id}:${order}`
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

            /* ==========================================
               SEND PRIVATE DM
               ========================================== */

            try {

                await customer.send({

                    content:
                        `Hey ${customer}! 👋\n\n` +
                        `Thank you for purchasing from **HudLabs**!\n` +
                        `We'd really appreciate it if you could take a moment to leave us a review. ⭐`,

                    embeds: [
                        embed
                    ],

                    components: [
                        row
                    ],
                });

            } catch (error) {

                console.error(
                    '[HudLabs Reviews] Could not DM user:',
                    error
                );

                return interaction.reply({
                    content:
                        `❌ I couldn't DM ${customer}.\n` +
                        `They may have their DMs disabled.`,

                    ephemeral: true,
                });
            }

            /*
             * Only staff sees this.
             */

            return interaction.reply({
                content:
                    `✅ Review request privately sent to ${customer}.`,

                ephemeral: true,
            });
        }

        /* ==========================================
           /review stats
           ========================================== */

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
                        [
                            `${getStars(rating)} **${rating}/5.0**`,
                            '',
                            `Based on **${reviews.length}** review${reviews.length === 1 ? '' : 's'}.`,
                        ].join('\n')
                    );

            return interaction.reply({
                embeds: [
                    embed
                ],

                ephemeral: true,
            });
        }
    },

    /* ==========================================
       BUTTON HANDLER
       ========================================== */

    async handleButton(interaction) {

        if (
            !interaction.customId.startsWith(
                'hudlabs_review:'
            )
        ) {
            return;
        }

        const parts =
            interaction.customId.split(':');

        const guildId =
            parts[1];

        const customerId =
            parts[2];

        const order =
            parts.slice(3).join(':');

        /*
         * Only the customer can review.
         */

        if (
            interaction.user.id !==
            customerId
        ) {
            return interaction.reply({
                content:
                    '❌ This review request belongs to another customer.',

                ephemeral: true,
            });
        }

        /*
         * Create modal.
         */

        const modal =
            new ModalBuilder()
                .setCustomId(
                    `hudlabs_review_modal:${guildId}:${customerId}:${order}`
                )
                .setTitle(
                    'HudLabs Review'
                );

        const ratingInput =
            new TextInputBuilder()
                .setCustomId(
                    'rating'
                )
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

        await interaction.showModal(
            modal
        );
    },

    /* ==========================================
       MODAL HANDLER
       ========================================== */

    async handleModal(interaction) {

        if (
            !interaction.customId.startsWith(
                'hudlabs_review_modal:'
            )
        ) {
            return;
        }

        const parts =
            interaction.customId.split(':');

        const guildId =
            parts[1];

        const customerId =
            parts[2];

        const order =
            parts.slice(3).join(':');

        /*
         * Make sure correct customer submits.
         */

        if (
            interaction.user.id !==
            customerId
        ) {
            return interaction.reply({
                content:
                    '❌ You cannot submit this review.',

                ephemeral: true,
            });
        }

        /*
         * Get rating.
         */

        const rating =
            Number(
                interaction.fields.getTextInputValue(
                    'rating'
                )
            );

        /*
         * Get written review.
         */

        const comment =
            interaction.fields
                .getTextInputValue(
                    'comment'
                )
                .trim();

        /*
         * Validate rating.
         */

        if (
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5
        ) {
            return interaction.reply({
                content:
                    '❌ Please enter a rating from 1 to 5.',

                ephemeral: true,
            });
        }

        if (!comment) {
            return interaction.reply({
                content:
                    '❌ Please write a review.',

                ephemeral: true,
            });
        }

        /*
         * Get current reviews.
         */

        const reviews =
            await getReviews(
                interaction.client,
                guildId
            );

        /*
         * Check if this order already
         * has a review.
         */

        const existingIndex =
            reviews.findIndex(
                review =>
                    review.userId ===
                        customerId &&
                    review.order ===
                        order
            );

        /*
         * Create review.
         */

        const review = {
            userId:
                customerId,

            username:
                interaction.user.username,

            product:
                existingIndex >= 0
                    ? reviews[existingIndex].product
                    : 'Asset Pack',

            price:
                existingIndex >= 0
                    ? reviews[existingIndex].price
                    : 'Paid',

            order:
                order,

            rating:
                rating,

            comment:
                comment,

            createdAt:
                new Date().toISOString(),
        };

        /*
         * Update existing review
         * or create a new review.
         */

        if (existingIndex >= 0) {

            reviews[
                existingIndex
            ] = {
                ...reviews[existingIndex],
                ...review,
            };

        } else {

            reviews.push(
                review
            );
        }

        /*
         * Save database.
         */

        await saveReviews(
            interaction.client,
            guildId,
            reviews
        );

        /*
         * Get updated rating.
         */

        const newRating =
            getRating(reviews);

        /*
         * Get member reviews channel.
         */

        const channel =
            await interaction.client.channels.fetch(
                MEMBER_REVIEWS_CHANNEL_ID
            );

        if (!channel) {
            return interaction.reply({
                content:
                    '❌ The member reviews channel could not be found.',

                ephemeral: true,
            });
        }

        /*
         * Make sure channel can receive messages.
         */

        if (
            !channel.isTextBased()
        ) {
            return interaction.reply({
                content:
                    '❌ The member reviews channel is not a text channel.',

                ephemeral: true,
            });
        }

        /*
         * Build PUBLIC review card.
         */

        const publicEmbed =
            buildReviewEmbed({
                user:
                    interaction.user,

                product:
                    review.product,

                price:
                    review.price,

                order:
                    review.order,

                rating:
                    newRating,

                reviewCount:
                    reviews.length,

                comment:
                    review.comment,
            });

        /*
         * Post review in:
         *
         * 1531866115146514586
         */

        try {

            await channel.send({
                embeds: [
                    publicEmbed
                ],
            });

        } catch (error) {

            console.error(
                '[HudLabs Reviews] Failed to post review:',
                error
            );

            return interaction.reply({
                content:
                    '❌ Your review was saved, but I could not post it in the member reviews channel.',

                ephemeral: true,
            });
        }

        /*
         * Tell customer their review
         * was successfully submitted.
         */

        return interaction.reply({
            content:
                '✅ **Review submitted!**\n\n' +
                'Thank you for supporting **HudLabs**! ⭐',

            ephemeral: true,
        });
    },
};
