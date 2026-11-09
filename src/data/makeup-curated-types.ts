/** Imported user-supplied portrait records; never claim salon-performed makeup. */
export type CuratedLook = {
  id: string; code: string; promptNumber: number;
  name: string; nameEn: string; category: "natural"|"soft"|"evening"|"bridal"|"eyes"|"lips";
  description: string; serviceId: string; finish: string;
  pigment: string; lid: string; blush: string; scarf: string; skin: string;
  image: string; thumb: string;
};
