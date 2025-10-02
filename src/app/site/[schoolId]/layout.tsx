// src/app/site/[schoolId]/layout.tsx
import type { Metadata, ResolvingMetadata } from 'next';
import { getSchoolById } from '@/services/schoolService';
import { ReactNode } from 'react';

type Props = {
  params: { schoolId: string }
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const schoolId = params.schoolId;
  const school = await getSchoolById(schoolId);

  // If the school is not found, return default metadata
  if (!school) {
    return {
      title: 'School Not Found',
      description: 'The requested school could not be found.',
    }
  }

  // Get previous metadata (from parent layouts)
  const previousImages = (await parent).openGraph?.images || [];

  return {
    title: {
      default: `${school.name} - Official Website`,
      template: `%s | ${school.name}`,
    },
    description: school.motto || `Welcome to the official website of ${school.name}.`,
    keywords: [school.name, school.district, school.level, 'education', 'school portal', 'Ulibtech'],
    openGraph: {
      title: `${school.name} - Official Website`,
      description: school.motto || `Explore news, events, and information about ${school.name}.`,
      url: `https://yourapp.com/site/${schoolId}`, // Replace with your actual domain
      siteName: school.name,
      images: [
        {
          url: school.badgeImageUrl || 'https://placehold.co/1200x630.png',
          width: 1200,
          height: 630,
        },
        ...previousImages,
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${school.name} - Official Website`,
      description: school.motto || `Welcome to the official website of ${school.name}.`,
      images: [school.badgeImageUrl || 'https://placehold.co/1200x630.png'],
    },
  }
}

export default function SchoolSiteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
