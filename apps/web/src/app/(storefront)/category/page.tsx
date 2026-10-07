import { serverGetCategories } from "@/api/server";
import { CategoryLandingView } from "@/component/category/CategoryLandingView";

export default async function CategoryIndexPage() {
  const categories = await serverGetCategories();
  return <CategoryLandingView categories={categories} />;
}