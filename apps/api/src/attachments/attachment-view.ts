import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type LedgerAttachmentObjectType = 'PROJECT' | 'CONTRACT' | 'BANK_TRANSACTION' | 'INVOICE' | 'MEMBERSHIP';

const publicAttachmentSelect = {
  id: true,
  objectId: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
} satisfies Prisma.AttachmentSelect;

type PublicAttachment = Prisma.AttachmentGetPayload<{ select: typeof publicAttachmentSelect }>;

export function serializeAttachment(attachment: PublicAttachment) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes.toString(),
    createdAt: attachment.createdAt,
  };
}

export async function attachmentMap(
  prisma: PrismaService,
  objectType: LedgerAttachmentObjectType,
  objectIds: string[],
) {
  const result: Record<string, ReturnType<typeof serializeAttachment>[]> = Object.fromEntries(
    objectIds.map((id) => [id, []]),
  );
  if (objectIds.length === 0) return result;

  const attachments = await prisma.attachment.findMany({
    where: { objectType, objectId: { in: objectIds } },
    select: publicAttachmentSelect,
    orderBy: { createdAt: 'desc' },
  });
  for (const attachment of attachments) result[attachment.objectId]?.push(serializeAttachment(attachment));
  return result;
}
