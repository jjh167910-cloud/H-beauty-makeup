import { router, json, error, ai } from '@appdeploy/sdk';

type Photo = { data?: unknown; mimeType?: unknown };
type Input = {
  source?: Photo;
  reference?: Photo;
  preset?: string;
  consent?: boolean;
};
const looks: Record<string, string> = {
  reference:
    'Use the makeup on input image 2 as a cosmetic style reference only, including lip pigmentation, eye makeup, lashes, liner, blush and realistic texture.',
  natural:
    'Apply luxury natural makeup: subtle skin tint with untouched pores, soft brown eyeshadow, clean separated lashes, gentle peach blush and rose-nude lips.',
  bridal:
    'Apply elegant classic bridal cosmetics: soft bronze neutral eyes, delicate eyeliner, individual lashes, rose cheeks and satin nude-rose lipstick.',
  glam: 'Apply high-end soft glam cosmetics: cocoa eyeshadow, sharp but natural eyeliner, fluttery individual lashes, diffused blush and mauve lips.',
  editorial:
    'Apply photo-realistic editorial makeup with clean eyeliner geometry, layered cosmetic pigment, defined eyelashes and rich lipstick finish.',
};
function valid(p?: Photo): p is { data: string; mimeType: string } {
  return (
    !!p &&
    typeof p.data === 'string' &&
    typeof p.mimeType === 'string' &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(p.mimeType) &&
    p.data.length > 100 &&
    p.data.length <= 8_000_000 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(p.data)
  );
}
export const handler = router({
  'GET /api/neural-info': [
    async () =>
      json({
        model: 'Gemini hosted neural image generation',
        automatic: true,
        cloudProcessing: true,
        maxInputPixels: 2_000_000,
        maxOutputBytes: 1_000_000,
        photorealismCertified: false,
      }),
  ],
  'POST /api/transfer': [
    async ({ body }) => {
      const input = (body ?? {}) as Input;
      if (input.consent !== true)
        return error('رضایت برای پردازش ابری لازم است.', 403);
      if (!valid(input.source)) return error('عکس چهره معتبر نیست.', 400);
      if (!input.preset || !Object.hasOwn(looks, input.preset))
        return error('سبک آرایش نامعتبر است.', 400);
      if (input.preset === 'reference' && !valid(input.reference))
        return error('عکس مرجع آرایش را بارگذاری کنید.', 400);
      if (input.reference && !valid(input.reference))
        return error('عکس مرجع نامعتبر است.', 400);
      const total =
        Math.ceil(input.source.data.length * 0.75) +
        (valid(input.reference) && input.preset === 'reference'
          ? Math.ceil(input.reference.data.length * 0.75)
          : 0);
      if (total > 6_000_000)
        return error('حجم عکس‌های ورودی بیشتر از محدودیت پردازش است.', 413);

      const prompt = [
        'You are a luxury editorial beauty photographer performing a precise photo edit.',
        'INPUT IMAGE 1 is the original subject. Preserve the SAME PERSON, face structure, nose, eye shapes and colors, eyebrows, lips, skin tone, expression, pose, accessories, hairstyle, outfit, original background, crop and camera lighting. Never face-swap or invent a new identity.',
        input.preset === 'reference'
          ? 'INPUT IMAGE 2 is the makeup style reference only. Copy its COSMETICS, not the identity or features of its subject. ' +
            looks.reference
          : looks[input.preset],
        'Reconstruct physically realistic cosmetic pigment and opacity with clean eyeshadow edges, lashes, eyeliner and lip definition. Preserve genuine skin pores, fine facial hairs, individual lashes, natural shadow structure and existing complexion.',
        'Do not smooth skin, change age, facial proportions, cheekbones, nose, hair, background, clothing, lighting or camera position. No exaggerated glass-like skin, artificial blur, double eyelashes, stickers or unwanted new accessories.',
        'Produce ONE photorealistic portrait with the SAME framing and aspect ratio as image 1. No text, watermark, labels, collage, split-screen or extra people.',
      ].join('\n');
      const images = [
        { data: input.source.data, mimeType: input.source.mimeType },
      ];
      if (input.preset === 'reference' && valid(input.reference))
        images.push({
          data: input.reference.data,
          mimeType: input.reference.mimeType,
        });
      try {
        const output = await ai.imageGen({
          prompt,
          images,
          maxOutputBytes: 1_000_000,
        });
        if (
          !output?.image?.data ||
          !output.image.mimeType?.startsWith('image/')
        )
          return error('مدل خروجی تصویری ارائه نکرد.', 502);
        return json({
          image: output.image,
          model: 'Gemini neural image editing',
          photorealismCertified: false,
        });
      } catch (err) {
        const failure = err as { statusCode?: number };
        if (failure?.statusCode === 429)
          return error('سهمیه سرویس تصویر تکمیل شده است.', 429);
        console.warn(
          'Neural makeup generation failed',
          failure?.statusCode ?? 'provider_error'
        );
        return error('ویرایش عصبی انجام نشد؛ لطفاً دوباره تلاش کنید.', 502);
      }
    },
  ],
});
