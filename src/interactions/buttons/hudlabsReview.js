import {
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { requestKey } from '../../commands/reviews.js';

const hudlabsReviewButton = {
    // This MUST match the part of the customId before the first ':'.
    // The button was created with `hudlabs_review:${token}`, so this
    // handler's name has to be exactly 'hudlabs_review'.
    name: 'hudlabs_review',

    async execute(interaction, client, args) {
        const [token] = args;

        if (!token) {
            await InteractionHelper.safeReply(interaction, {
                content: '❌ This review link is malformed.',
                ephemeral: true,
            });
            return;
        }

        let requestData;
        try {
            requestData = await client.db.get(requestKey(token), null);
        } catch (error) {
            logger.error('hudlabsReview: failed to load review request', {
                token,
                error: error.message,
            });
            await InteractionHelper.safeReply(interaction, {
                content: '❌ Something went wrong loading this review request.',
                ephemeral: true,
            });
            return;
        }

        if (!requestData) {
            await InteractionHelper.safeReply(interaction, {
                content: '❌ This review request has expired or was already used.',
                ephemeral: true,
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`hudlabs_review_modal:${token}`)
            .setTitle('Leave a Review');

        const ratingInput = new TextInputBuilder()
            .setCustomId('rating')
            .setLabel('Rating (1-5)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(1)
            .setRequired(true);

        const reviewInput = new TextInputBuilder()
            .setCustomId('review_text')
            .setLabel('Your review')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(ratingInput),
            new ActionRowBuilder().addComponents(reviewInput),
        );

        const shown = await InteractionHelper.safeShowModal(interaction, modal);
        if (!shown) {
            await InteractionHelper.safeReply(interaction, {
                content: '❌ Could not open the review form. Please try clicking the button again.',
                ephemeral: true,
            });
        }
    },
};

export default hudlabsReviewButton;
