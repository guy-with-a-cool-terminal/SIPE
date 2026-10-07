import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { Split } from "@/components/landing/Split";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Invoicing } from "@/components/landing/Invoicing";
import { Features } from "@/components/landing/Features";
import { Faq } from "@/components/landing/Faq";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

const Index = () => (
  <>
    <Nav />
    <main>
      <Hero />
      <Problem />
      <Split />
      <HowItWorks />
      <Invoicing />
      <Features />
      <Faq />
      <CTA />
    </main>
    <Footer />
  </>
);

export default Index;
