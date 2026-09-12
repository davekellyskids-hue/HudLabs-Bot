import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

// Attachment safety limits (kept local so only this file needs to change)
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
    'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'vbs', 'vbe',
    'js', 'jse', 'wsf', 'wsh', 'ps1', 'ps1xml', 'psc1', 'msh', 'msh1', 'msh2',
    'jar', 'apk', 'app', 'deb', 'rpm', 'sh', 'bash', 'run', 'dll', 'sys', 'gadget'
]);

function getFileExtension(filename = '') {
    const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
    return match ? match[1].toLowerCase() : '';
}

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Send a direct message (and optional file) to a user (Staff only)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to send a DM to")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("The message to send (optional if a file is attached)")
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName("file")
                .setDescription("A file to attach to the DM (optional)")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("Send the message anonymously (default: false)")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`DM interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

        const targetUser = interaction.options.getUser("user");
        const message = interaction.options.getString("message");
        const attachment = interaction.options.getAttachment("file");
        const anonymous = interaction.options.getBoolean("anonymous") || false;

        try {
            if (!message && !attachment) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Provide a message, a file, or both.' });
            }

            if (message && message.length > 2000) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Messages must be under 2000 characters.' });
            }

            if (targetUser.bot) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot send DMs to bot accounts.' });
            }

            let files;
            if (attachment) {
                if (attachment.size > MAX_ATTACHMENT_SIZE_BYTES) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: `That file is too large to relay (limit: ${Math.floor(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))} MB).`
                    });
                }

                const extension = getFileExtension(attachment.name);
                if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extension)) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: `Files with the ".${extension}" extension can't be sent through this command for safety reasons.`
                    });
                }

                files = [{ attachment: attachment.url, name: attachment.name }];
            }

            const sanitized = message ? sanitizeMarkdown(message) : null;

            const dmChannel = await targetUser.createDM();

            const dmEmbed = successEmbed(
                anonymous ? "Message from the Staff Team" : `Message from ${interaction.user.tag}`,
                sanitized || (attachment ? `Sent you a file: **${attachment.name}**` : '')
            ).setFooter({
                text: `You cannot reply to this message. | Logger ID: ${interaction.id}`
            });

            await dmChannel.send({
                embeds: [dmEmbed],
                ...(files ? { files } : {})
            });

            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "DM Sent",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Anonymous: ${anonymous ? 'Yes' : 'No'}${attachment ? ` | Attachment: ${attachment.name}` : ''}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: sanitized ? sanitized.length : 0,
                        attachmentName: attachment?.name || null,
                        attachmentSize: attachment?.size || null
                    }
                }
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "DM Sent",
                        `Successfully sent ${attachment ? 'a message and file' : 'a message'} to ${targetUser.tag}`
                    ),
                ],
            });
        } catch (error) {
            logger.error('DM command error:', error);

            if (error.code === 50007) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Could not send a DM to ${targetUser.tag}. They may have DMs disabled.` });
            }

            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Failed to send DM: ${error.message}` });
        }
    }
};
