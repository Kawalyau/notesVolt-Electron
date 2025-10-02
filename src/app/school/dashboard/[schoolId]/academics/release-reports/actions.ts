
// src/app/school/dashboard/[schoolId]/academics/release-reports/actions.ts
'use server';

import { firestore, functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import { getSchoolById, getSchoolSubcollectionItems, getStudentExamProfile } from '@/services';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import type { School, ReportConfiguration, Student, GradingScale, StudentExamProfile, ExamSubject } from '@/types/school';

interface PublishAndNotifyPayload {
  configId: string;
  schoolId: string;
}

interface PublishAndNotifyResponse {
  success: boolean;
  message: string;
  reportsGenerated?: number;
  smsSent?: number;
  error?: string;
}

interface StudentReportPayload {
    student: Student;
    division: string | null;
    aggregate: number | null;
}

export async function publishAndNotify(payload: PublishAndNotifyPayload): Promise<PublishAndNotifyResponse> {
  const { configId, schoolId } = payload;
  console.log(`Starting publishing process for config: ${configId} in school: ${schoolId}`);
  
  try {
    const config = (await getSchoolSubcollectionItems<ReportConfiguration>(schoolId, 'reportConfigurations')).find(c => c.id === configId);
    if (!config) throw new Error("Report Configuration not found.");

    const school = await getSchoolById(schoolId);
    if (!school) throw new Error("School not found.");
    
    const [allStudents, allGradingScales] = await Promise.all([
      getSchoolSubcollectionItems<Student>(schoolId, 'students', [{ field: 'status', op: '==', value: 'Active' }]),
      getSchoolSubcollectionItems<GradingScale>(schoolId, 'gradingScales'),
    ]);
    
    const examSubjects: Array<ExamSubject & { examId: string }> = [];
    for (const source of config.sources) {
      const sourceSubjects = await getSchoolSubcollectionItems<ExamSubject>(schoolId, `exams/${source.examId}/subjects`);
      examSubjects.push(...sourceSubjects.map(s => ({ ...s, examId: source.examId })));
    }
    const uniqueSubjects = Array.from(new Map(examSubjects.map(s => [s.subjectId, { id: s.subjectId, name: s.subjectName }])).values())
        .sort((a,b) => a.name.localeCompare(b.name));

    const scale = allGradingScales.find(s => s.id === config.gradingScaleId);
    if (!scale) throw new Error("Grading scale for this configuration not found.");

    let reportsGenerated = 0;
    const batch = writeBatch(firestore);
    const studentReportPayloadsForSms: StudentReportPayload[] = [];

    for (const student of allStudents) {
      const studentProfiles: Record<string, StudentExamProfile | null> = {};
      for (const source of config.sources) {
        studentProfiles[source.examId] = await getStudentExamProfile(schoolId, source.examId, student.id);
      }
      
      const finalScores: Record<string, any> = {};
      let aggregate = 0;
      let totalMarks = 0;
      let hasFailed = false;

      uniqueSubjects.forEach(subject => {
        let totalWeightedScore = 0;
        let totalWeightUsed = 0;
        
        config.sources.forEach(source => {
            const examSubjectForMaxScore = examSubjects.find(es => es.examId === source.examId && es.subjectId === subject.id);
            if (!examSubjectForMaxScore || !studentProfiles[source.examId]) return;

            const scoreInfo = studentProfiles[source.examId]?.scores.find(s => s.examSubjectId === examSubjectForMaxScore.id);
            const sourceScoreValue = scoreInfo?.score ?? null;
            const maxScore = examSubjectForMaxScore.maxScore;

            if (sourceScoreValue !== null && maxScore > 0) {
              const normalizedScore = (sourceScoreValue / maxScore) * 100;
              totalWeightedScore += normalizedScore * (source.weight / 100);
              totalWeightUsed += source.weight;
            }
        });

        if (totalWeightUsed > 0) {
          const finalScore = totalWeightUsed < 100 ? (totalWeightedScore / totalWeightUsed) * 100 : totalWeightedScore;
          const grade = scale.grades.find(g => finalScore >= g.lowerBound && finalScore <= g.upperBound);
          
          finalScores[subject.id] = { finalScore: Math.round(finalScore), grade: grade?.name, value: grade?.value };
          
          const subjectDetails = examSubjects.find(s => s.subjectId === subject.id);
          if (subjectDetails?.isCoreSubject && grade) {
            aggregate += grade.value;
            if (grade.value >= scale.failValue) hasFailed = true;
          }
          totalMarks += Math.round(finalScore);
        }
      });
      
      let division = hasFailed ? (scale.divisions.find(d => d.name.toLowerCase().includes('ungraded'))?.name || 'Ungraded')
                               : (aggregate > 0 ? scale.divisions.find(d => aggregate >= d.minAggregate && aggregate <= d.maxAggregate)?.name || 'Ungraded' : null);

      studentReportPayloadsForSms.push({ student, division, aggregate });

      // Create the public report document
      const reportDocRef = doc(firestore, 'publishedReports', `${student.studentRegistrationNumber}_${config.id}`);
      const reportPayload = {
        schoolId,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        studentRegNo: student.studentRegistrationNumber,
        configId: config.id,
        configName: config.name,
        scores: finalScores,
        aggregate,
        division,
        totalMarks,
        publishedAt: serverTimestamp(),
      };
      batch.set(reportDocRef, reportPayload);
      reportsGenerated++;
    }

    // Commit all report documents to Firestore
    await batch.commit();

    // Send SMS notifications with results
    let smsSent = 0;
    const sendSmsFunction = httpsCallable(functions, 'sendEgoSms1');
    for (const payload of studentReportPayloadsForSms) {
      const { student, division, aggregate } = payload;
      if (student.guardianPhone) {
        try {
          const message = `Hello, results for ${student.firstName} ${student.lastName} are out. Division: ${division || 'N/A'}, Aggregate: ${aggregate ?? 'N/A'}. More details at ${process.env.NEXT_PUBLIC_BASE_URL}/report-viewer. RegNo: ${student.studentRegistrationNumber}.`;
          await sendSmsFunction({ schoolId, recipient: student.guardianPhone, message });
          smsSent++;
        } catch (smsError) {
          console.warn(`Failed to send SMS to ${student.guardianPhone} for student ${student.id}:`, smsError);
        }
      }
    }
    
    return { success: true, message: "Reports published and notifications sent.", reportsGenerated, smsSent };
  } catch (error: any) {
    console.error("Error in publishAndNotify action:", error);
    return { success: false, error: error.message || "An unknown server error occurred." };
  }
}
