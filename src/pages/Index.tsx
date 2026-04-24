import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Buckets } from "@/components/landing/Buckets";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Story } from "@/components/landing/Story";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

const Index = () => (
  <main className="relative noise">
    <Nav />
    <Hero />
    <Story />
    <Buckets />
    <HowItWorks />
    <CTA />
    <Footer />
  </main>
);

export default Index;
