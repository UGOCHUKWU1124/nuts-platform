import { serverGetCategories,serverGetGoingNuts } from "@/api/server";
import { CategoryIconBar } from "@/component/category/CategoryIconBar";
import { GoingNutsCarousel } from "@/component/home/GoingNutsCarousel";
import { CustomerLayout } from "@/component/layout/CustomerLayout";

export default async function HomePage() {
  const [categories, products] = await Promise.all([
    serverGetCategories(),
    serverGetGoingNuts(20),
  ]);

  return (
    <CustomerLayout categories={categories}>
      {/* ─── 1. TOP CATEGORY ICON STRIP (Pre-rendered from Server) ─── */}
      <CategoryIconBar categories={categories} />

      <div className="space-y-16 pb-24 pt-8">
        {/* ─── 2. GOING NUTS CAROUSEL ─── */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <GoingNutsCarousel initialProducts={products} />
        </section>
      </div>
    </CustomerLayout>
  );
}
