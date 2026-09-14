import { EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { requestKey } from '../../commands/reviews.js';

const REVIEWS_KEY_PREFIX = 'temp:hudlabs_reviews:';
const REVIEWS_CHANNEL_ID = '1531866115146514586';

// REPLACE THIS WITH YOUR CUSTOM STAR EMOJI STRING OR ID:
// Example format: '<:star:123456789012345678>'
const CUSTOM_STAR_EMOJI = '<:star:123456789012345678>';

const hudlabsReviewModal = {
    // Must match customId prefix: `hudlabs_review_modal:${token}`
    name: 'hudlabs_review_modal',

    async execute(interaction, client, args) {
        const [token] = args;

        const deferred = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferred) return;

        if (!token) {
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ This review link is malformed.',
            });
            return;
        }

        let requestData;
        try {
            requestData = await client.db.get(requestKey(token), null);
        } catch (error) {
            logger.error('hudlabsReviewModal: failed to load review request', {
                token,
                error: error.message,
            });
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Something went wrong loading this review request.',
            });
            return;
        }

        if (!requestData) {
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ This review request has expired or was already used.',
            });
            return;
        }

        let rawRating = '';
        let reviewText = '';

        try {
            if (typeof interaction.fields.getRadioGroup === 'function') {
                rawRating = interaction.fields.getRadioGroup('rating', false) || '';
            }
            if (!rawRating) {
                rawRating = interaction.fields.getTextInputValue('rating') || '';
            }
            reviewText = interaction.fields.getTextInputValue('review_text')?.trim() || '';
        } catch (fieldErr) {
            logger.error('hudlabsReviewModal: error reading modal fields', { error: fieldErr.message });
        }

        let rating = parseInt(rawRating.replace(/[^0-9]/g, ''), 10);

        if (isNaN(rating) || rating < 1 || rating > 5) {
            const starMatches = (rawRating.match(/⭐|\u2B50/g) || []).length;
            if (starMatches >= 1 && starMatches <= 5) {
                rating = starMatches;
            }
        }

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Please enter a valid rating between 1 and 5.',
            });
            return;
        }

        const reviewEntry = {
            token,
            guildId: requestData.guildId,
            userId: requestData.userId,
            product: requestData.product,
            price: requestData.price,
            order: requestData.order,
            rating,
            text: reviewText,
            createdAt: new Date().toISOString(),
        };

        try {
            const reviewsKey = `${REVIEWS_KEY_PREFIX}${requestData.guildId}`;
            const existing = await client.db.get(reviewsKey, []);
            const list = Array.isArray(existing) ? existing : [];
            list.push(reviewEntry);
            await client.db.set(reviewsKey, list);

            await client.db.delete(requestKey(token)).catch(() => {});
        } catch (error) {
            logger.error('hudlabsReviewModal: failed to save review', {
                token,
                error: error.message,
            });
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Something went wrong saving your review. Please try again.',
            });
            return;
        }

        // Creates custom star emojis (e.g. 5 stars = 5 custom star icons)
        const stars = CUSTOM_STAR_EMOJI.repeat(rating);

        const [reviewer, guild] = await Promise.all([
            client.users.fetch(requestData.userId).catch(() => null),
            client.guilds.fetch(requestData.guildId).catch(() => null),
        ]);

        const reviewEmbed = new EmbedBuilder()
            .setColor(0x8A2BE2) // Purple accent bar
            .setAuthor({
                name: reviewer
                    ? `${reviewer.globalName || reviewer.username} (@${reviewer.username})`
                    : `User ${requestData.userId}`,
                iconURL: reviewer?.displayAvatarURL?.() ?? undefined,
            })
            .setTitle('New Review')
            .setThumbnail(reviewer?.displayAvatarURL?.({ size: 256 }) ?? null)
            .setDescription([
                stars,
                '',
                '🛡️ **Verified Purchase**',
                '',
                reviewText ? `> ${reviewText.replace(/\n/g, '\n> ')}` : '*No written review left.*',
            ].join('\n'))
            .addFields(
                { name: '📦  Pack', value: requestData.product || 'N/A', inline: true },
                { name: '💵  Paid', value: requestData.price || 'N/A', inline: true },
                { name: '🧾  Order', value: requestData.order || 'N/A', inline: true },
            )
            .setFooter({
                text: 'HudLabs • Verified Purchase',
                iconURL: guild?.iconURL?.() ?? undefined,
            })
            .setTimestamp();

        try {
            await interaction.message.edit({
                embeds: [reviewEmbed],
                components: [],
            });
        } catch (error) {
            logger.warn('hudlabsReviewModal: failed to update DM embed', {
                token,
                error: error.message,
            });
        }

        try {
            const reviewsChannel = await client.channels.fetch(REVIEWS_CHANNEL_ID);

            if (reviewsChannel?.isTextBased?.()) {
                await reviewsChannel.send({ embeds: [reviewEmbed] });
            } else {
                logger.warn('hudlabsReviewModal: reviews channel is not text-based or was not found', {
                    channelId: REVIEWS_CHANNEL_ID,
                });
            }
        } catch (error) {
            logger.warn('hudlabsReviewModal: failed to post review to reviews channel', {
                channelId: REVIEWS_CHANNEL_ID,
                token,
                error: error.message,
            });
        }

        await InteractionHelper.safeEditReply(interaction, {
            content: '✅ Thanks for your review!',
        });
    },
};

export default hudlabsReviewModal;
