// src/app/page.tsx - Ulibtech Landing Page
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, BarChart3, Users, DollarSign, ShieldCheck, Mail, Laptop, Smartphone, Cloud, Shield, AreaChart, HelpCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const schoolFeatures = [
  {
    icon: Users,
    title: "Student Management",
    description: "Comprehensive student profiles, class assignments, and history tracking.",
  },
  {
    icon: GraduationCap,
    title: "Academics & Exams",
    description: "Manage exams, grading scales, marks entry, and generate detailed report cards.",
  },
  {
    icon: DollarSign,
    title: "Fee Management",
    description: "Automated billing, fee collection tracking, and detailed financial statements.",
  },
  {
    icon: BarChart3,
    title: "Insightful Reporting",
    description: "Generate academic broadsheets, financial summaries, and requirement status reports.",
  },
];

const techServices = [
  {
    icon: Laptop,
    title: "Custom Software Development",
    description: "We create tailored software solutions that address your specific business needs and challenges.",
  },
  {
    icon: Smartphone,
    title: "Mobile App Development",
    description: "From iOS to Android, we build cross-platform mobile applications that deliver exceptional user experiences.",
  },
  {
    icon: Cloud,
    title: "Cloud Solutions",
    description: "We help you migrate to the cloud and optimize your infrastructure for scalability and reliability.",
  },
  {
    icon: Shield,
    title: "Cybersecurity",
    description: "Protect your business data and systems with our comprehensive security solutions and practices.",
  },
  {
    icon: AreaChart,
    title: "Data Analytics",
    description: "Turn your data into actionable insights with our advanced analytics and visualization tools.",
  },
  {
    icon: HelpCircle,
    title: "IT Consulting",
    description: "Get expert advice on technology strategy, digital transformation, and IT infrastructure optimization.",
  },
];

export default function UlibtechLandingPage() {
  return (
    <div className="bg-background text-foreground">
      {/* Hero Section - UlibTech Company */}
      <section className="relative bg-gradient-to-r from-blue-50 to-indigo-100 py-20 sm:py-32 overflow-hidden">
        <div className="container mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="flex-1 text-left">
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-blue-800 mb-4">
                Ulib<span className="text-indigo-600">Tech</span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-700 mb-8 max-w-2xl">
                Innovative Technology Solutions for Your Business
              </p>
              <p className="text-muted-foreground mb-8 max-w-2xl">
                We design cutting-edge software and provide tech services that help businesses thrive in the digital age.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button asChild size="lg" className="bg-blue-700 hover:bg-blue-800">
                  <Link href="#services">Our Services</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="#school-system">School Management System</Link>
                </Button>
              </div>
            </div>
            <div className="flex-1 flex justify-center">
              <div className="relative w-full max-w-md">
                <Image
                  src="https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80"
                  alt="UlibTech Solutions"
                  width={500}
                  height={400}
                  className="rounded-xl shadow-2xl animate-float"
                  data-ai-hint="team working"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Services Section */}
      <section id="services" className="py-20 sm:py-24">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold tracking-tight">Our Technology Services</h2>
            <p className="mt-4 text-muted-foreground">
              We offer a wide range of technology solutions to help your business grow and succeed
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {techServices.map((service, index) => (
              <Card key={index} className="text-center shadow-sm hover:shadow-lg transition-shadow duration-300 h-full">
                <CardHeader>
                  <div className="mx-auto bg-blue-100 p-3 rounded-full w-fit">
                    <service.icon className="h-8 w-8 text-blue-700" />
                  </div>
                  <CardTitle className="mt-4">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">{service.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* About UlibTech Section */}
      <section className="py-20 sm:py-24 bg-muted/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <h2 className="text-3xl font-bold tracking-tight mb-6">About UlibTech</h2>
              <p className="text-muted-foreground mb-4">
                Founded in 2010, UlibTech has been at the forefront of technology innovation, helping businesses of all sizes leverage the power of digital solutions.
              </p>
              <p className="text-muted-foreground mb-6">
                Our team of experienced developers, designers, and technology consultants work together to deliver solutions that drive growth, efficiency, and competitive advantage.
              </p>
              <div className="grid grid-cols-3 gap-6 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-700">13+</div>
                  <div className="text-sm text-muted-foreground">Years Experience</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-700">250+</div>
                  <div className="text-sm text-muted-foreground">Projects Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-700">100+</div>
                  <div className="text-sm text-muted-foreground">Happy Clients</div>
                </div>
              </div>
              <Button asChild className="bg-blue-700 hover:bg-blue-800">
                <Link href="#contact">Contact Us</Link>
              </Button>
            </div>
            <div className="flex-1">
              <Image
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80"
                alt="UlibTech Team"
                width={600}
                height={400}
                className="rounded-xl shadow-xl"
                data-ai-hint="diverse team"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Founder Section */}
      <section id="founder" className="py-20 sm:py-24">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Meet Our Founder</h2>
            <h3 className="text-2xl font-semibold text-blue-700 mb-6">Kawalya Umar</h3>
            <p className="text-muted-foreground mb-4">
              Kawalya Umar is the visionary force behind UlibTech. With over a decade of experience in software engineering and a deep-seated passion for educational technology, Kawalya founded UlibTech with a singular mission: to empower institutions through innovative, accessible, and powerful digital tools.
            </p>
            <p className="text-muted-foreground mb-4">
              His journey began in the classrooms of Uganda, where he witnessed firsthand the administrative challenges that hinder educational progress. This experience ignited a drive to create a solution that not only simplifies school management but also enhances the learning experience for students, teachers, and parents alike.
            </p>
            <p className="text-muted-foreground mb-6">
              Under his leadership, UlibTech has grown from a passionate idea into a leading provider of management systems, committed to quality, user-centric design, and continuous innovation. Kawalya believes that technology, when applied thoughtfully, can bridge gaps, create opportunities, and unlock the full potential of every educational institution.
            </p>
          </div>
        </div>
      </section>

      {/* School Management System Section */}
      <section id="school-system" className="py-20 sm:py-24 bg-muted/50">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Ulibtech SchoolMS</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            The all-in-one platform to streamline your school's administration, finances, and academics.
          </p>
          
          <div className="mb-12">
            <Button asChild size="lg" className="bg-blue-700 hover:bg-blue-800">
              <Link href="/school/auth">Go to School Management System</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {schoolFeatures.map((feature, index) => (
              <Card key={index} className="text-center shadow-sm hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="mx-auto bg-blue-100 p-3 rounded-full w-fit">
                    <feature.icon className="h-8 w-8 text-blue-700" />
                  </div>
                  <CardTitle className="mt-4">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Public Facing Portal Section */}
      <section className="py-20 sm:py-24">
        <div className="container mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <h2 className="text-3xl font-bold tracking-tight">Engage Your Community</h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Our platform isn't just for administration. We provide public-facing portals to keep parents and the community connected.
            </p>
            <ul className="mt-6 space-y-4">
              <li className="flex items-start">
                <ShieldCheck className="h-6 w-6 text-blue-700 mr-3 mt-1 shrink-0" />
                <div>
                  <h4 className="font-semibold">Public School Websites</h4>
                  <p className="text-muted-foreground">Each school gets a customizable, public-facing website to showcase their institution. Manage news, events, and galleries with ease.</p>
                </div>
              </li>
              <li className="flex items-start">
                <DollarSign className="h-6 w-6 text-blue-700 mr-3 mt-1 shrink-0" />
                <div>
                  <h4 className="font-semibold">Fee Balance Portal</h4>
                  <p className="text-muted-foreground">A simple and secure portal for parents to check their child's fee balance directly from the school's public website.</p>
                </div>
              </li>
            </ul>
            <div className="mt-8 flex gap-4">
              <Button asChild className="bg-blue-700 hover:bg-blue-800">
                <Link href="/school/auth">Explore Admin Portal</Link>
              </Button>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <Image
              src="https://images.unsplash.com/photo-1543269865-cbf427effbad?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80"
              alt="Screenshot of a public school website"
              width={800}
              height={600}
              className="rounded-xl shadow-2xl"
              data-ai-hint="happy students learning"
            />
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-20 sm:py-24 bg-muted/50">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to Transform Your School?</h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Join dozens of institutions that trust Ulibtech to simplify their operations and enhance communication.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button asChild size="lg" className="bg-blue-700 hover:bg-blue-800">
              <Link href="/signup">Sign Up Now</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#contact">Request a Demo</Link>
            </Button>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer id="contact" className="bg-muted/30 border-t">
        <div className="container mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
            <div>
              <h3 className="text-lg font-semibold text-blue-700">Ulibtech Software</h3>
              <p className="text-sm text-muted-foreground mt-2">Simplifying Education Management.</p>
              <p className="text-sm text-muted-foreground mt-2">Bulo, Butambala District, Uganda</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Quick Links</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li><Link href="#services" className="text-muted-foreground hover:text-blue-700">Services</Link></li>
                <li><Link href="#school-system" className="text-muted-foreground hover:text-blue-700">School System</Link></li>
                <li><Link href="/school/auth" className="text-muted-foreground hover:text-blue-700">Admin Portal</Link></li>
                <li><Link href="/check-balance" className="text-muted-foreground hover:text-blue-700">Fee Checker</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Contact Us</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4"/> kawalyaumar500@gmail.com
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-muted text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} UlibTech. All Rights Reserved.</p>
          </div>
        </div>
      </footer>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
