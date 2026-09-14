import {
    ModalBuilder,
    LabelBuilder,
    RadioGroupBuilder,
    RadioGroupOptionBuilder,
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

        const ratingRadioGroup = new RadioGroupBuilder()
            .setCustomId('rating')
            .setRequired(true)
            .addOptions(
                new RadioGroupOptionBuilder().setLabel('⭐☆☆☆☆  1 - Poor').setValue('1'),
                new RadioGroupOptionBuilder().setLabel('⭐⭐☆☆☆  2 - Below Average').setValue('2'),
                new RadioGroupOptionBuilder().setLabel('⭐⭐⭐☆☆  3 - Average').setValue('3'),
                new RadioGroupOptionBuilder().setLabel('⭐⭐⭐⭐☆  4 - Good').setValue('4'),
                new RadioGroupOptionBuilder()
                    .setLabel('⭐⭐⭐⭐⭐  5 - Excellent')
                    .setValue('5')
                    .setDefault(true),
            );

        const ratingLabel = new LabelBuilder()
            .setLabel('Your rating')
            .setRadioGroupComponent(ratingRadioGroup);

        const reviewInput = new TextInputBuilder()
            .setCustomId('review_text')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(false);

        const reviewLabel = new LabelBuilder()
            .setLabel('Your review (optional)')
            .setTextInputComponent(reviewInput);

        modal.addComponents(ratingLabel, reviewLabel);

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
