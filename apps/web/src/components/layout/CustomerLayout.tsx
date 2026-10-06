import type { CategoryResponseDto } from "@/api/dto/category";
import { BottomNav } from "@/component/layout/BottomNav";
import { Footer } from "@/component/layout/Footer";
import { Navbar } from "@/component/navbar/Navbar";
import { type ReactNode } from "react";

export function CustomerLayout({
  children,
  categories,
}: {
  children: ReactNode;
  categories?: CategoryResponseDto[];
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <Navbar categories={categories} />
      <main className="min-w-0 flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] xl:pb-0">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
