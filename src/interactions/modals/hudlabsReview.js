import { EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { requestKey } from '../../commands/reviews.js';

const REVIEWS_KEY_PREFIX = 'temp:hudlabs_reviews:';
const REVIEWS_CHANNEL_ID = '1531866115146514586';

const hudlabsReviewModal = {
    // Must match the customId prefix set on the modal:
    // `hudlabs_review_modal:${token}`
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

        const rawRating = interaction.fields.getRadioGroup('rating', true);
        const rating = Number(rawRating);
        const reviewText = interaction.fields.getTextInputValue('review_text')?.trim() || '';

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Please enter a rating between 1 and 5.',
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

        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

        const buildReviewEmbed = (baseEmbed) =>
            EmbedBuilder.from(baseEmbed || {})
                .setDescription([
                    `<@${requestData.userId}>`,
                    '',
                    '💚 **Verified Purchase**',
                    '',
                    `${stars} (${rating}/5)`,
                    reviewText ? `\n${reviewText}` : '',
                ].join('\n'))
                .setFooter({ text: 'HudLabs • Review submitted' });

        try {
            const updatedEmbed = buildReviewEmbed(interaction.message.embeds[0]);

            await interaction.message.edit({
                embeds: [updatedEmbed],
                components: [],
            });
        } catch (error) {
            // Non-fatal: the review is saved even if we can't edit the DM message
            // (e.g. it's too old, or was deleted).
            logger.warn('hudlabsReviewModal: failed to update DM embed', {
                token,
                error: error.message,
            });
        }

        try {
            const reviewsChannel = await client.channels.fetch(REVIEWS_CHANNEL_ID);

            if (reviewsChannel?.isTextBased?.()) {
                const channelEmbed = buildReviewEmbed(interaction.message.embeds[0])
                    .addFields(
                        { name: 'Pack', value: requestData.product || 'N/A', inline: true },
                        { name: 'Paid', value: requestData.price || 'N/A', inline: true },
                        { name: 'Order', value: requestData.order || 'N/A', inline: true },
                    );

                await reviewsChannel.send({ embeds: [channelEmbed] });
            } else {
                logger.warn('hudlabsReviewModal: reviews channel is not text-based or was not found', {
                    channelId: REVIEWS_CHANNEL_ID,
                });
            }
        } catch (error) {
            // Non-fatal: the review is still saved to the DB even if posting fails
            // (e.g. missing permissions, wrong channel ID, channel deleted).
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
