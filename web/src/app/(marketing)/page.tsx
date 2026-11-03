import { BannerStrip } from "@/components/marketing/banner-strip";
import { SectionRenderer } from "@/components/marketing/section-renderer";
import { getPublicConfig, getSections } from "@/lib/config/server";

export default async function LandingPage() {
  const [config, sections] = await Promise.all([getPublicConfig(), getSections("landing")]);
  const banners = config.banners.filter((b) => b.placement === "landing_top");

  return (
    <>
      <BannerStrip banners={banners} />
      <SectionRenderer sections={sections} />
    </>
  );
}
