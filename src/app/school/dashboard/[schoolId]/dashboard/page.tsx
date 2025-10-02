
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, getDocs, collection, query, where, collectionGroup, Timestamp, orderBy, limit } from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import type { School, Student, Teacher, SchoolClass, SchoolIncome, SchoolExpense, FeeTransaction, AppTimestamp, Ticket, Event } from '@/types/school';
import { useAuth } from '@/hooks/use-auth';
import {
  Loader2,
  Users,
  Wallet,
  LayoutDashboard,
  School as SchoolIcon,
  Briefcase,
  DollarSign,
  BarChart,
  LineChart,
  TrendingUp,
  TrendingDown,
  Ticket as TicketIcon,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  BarChart as RechartsBarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  Bar,
  CartesianGrid,
} from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, isValid, eachMonthOfInterval } from 'date-fns';
import { Button } from '@/components/ui/button';

const StatCard = ({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) => {
  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-full ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
};

// Helper function to safely parse dates that could be Timestamps or strings
const parseAppTimestamp = (timestamp: AppTimestamp | undefined): Date | null => {
    if (!timestamp) return null;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    if (typeof timestamp === 'string') {
        const d = parseISO(timestamp);
        return isValid(d) ? d : null;
    }
    if (timestamp instanceof Date) return timestamp;
    return null;
};


export default function SchoolDashboardPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    outstandingFees: 0,
    openTickets: 0,
  });
  
  const [financialTrendData, setFinancialTrendData] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [openTickets, setOpenTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    if (authLoading || !user || !schoolId) {
      if (!authLoading && !user) router.push('/school/auth');
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      const schoolDocRef = doc(firestore, 'schools', schoolId);
      try {
        const docSnap = await getDoc(schoolDocRef);
        if (docSnap.exists()) {
          const schoolData = { id: docSnap.id, ...docSnap.data() } as School;
          setSchool(schoolData);

          if (!schoolData.adminUids.includes(user.uid)) {
            router.push('/school/auth');
            return;
          }

          // Fetch all data in parallel
          const studentsQuery = query(collection(firestore, `schools/${schoolId}/students`), where('status', '==', 'Active'));
          const classesQuery = collection(firestore, `schools/${schoolId}/schoolClasses`);
          const teachersQuery = query(collection(firestore, `schools/${schoolId}/teachers`), where('status', '==', 'Active'));
          const incomesQuery = collection(firestore, `schools/${schoolId}/income`);
          const expensesQuery = collection(firestore, `schools/${schoolId}/expenses`);
          const ticketsQuery = query(collection(firestore, `schools/${schoolId}/tickets`), where('status', 'in', ['Open', 'Pending']), orderBy('createdAt', 'desc'), limit(5));
          const eventsQuery = query(collection(firestore, `schools/${schoolId}/events`), where('date', '>=', Timestamp.now()), orderBy('date', 'asc'), limit(5));
          const feeTransactionsQuery = query(collectionGroup(firestore, 'feeTransactions'), where('schoolId', '==', schoolId), where('type', '==', 'credit'));

          const [
            studentsSnap, 
            classesSnap, 
            teachersSnap,
            incomesSnap,
            expensesSnap,
            feeTransactionsSnap,
            ticketsSnap,
            eventsSnap,
          ] = await Promise.all([
            getDocs(studentsQuery),
            getDocs(classesQuery),
            getDocs(teachersQuery),
            getDocs(incomesQuery),
            getDocs(expensesQuery),
            getDocs(feeTransactionsQuery),
            getDocs(ticketsQuery),
            getDocs(eventsQuery),
          ]);
          
          setUpcomingEvents(eventsSnap.docs.map(d => ({id: d.id, ...d.data()} as Event)));
          setOpenTickets(ticketsSnap.docs.map(d => ({id: d.id, ...d.data()} as Ticket)));

          const totalOutstanding = studentsSnap.docs.reduce((sum, doc) => sum + (doc.data().feeBalance || 0), 0);

          setStats({
            students: studentsSnap.size,
            teachers: teachersSnap.size,
            classes: classesSnap.size,
            outstandingFees: totalOutstanding,
            openTickets: ticketsSnap.size,
          });

          // Process data for the financial chart
          const now = new Date();
          const endDate = endOfMonth(now);
          const startDate = startOfMonth(subMonths(now, 11));
          
          const monthlyData: { [key: string]: { income: number; expenses: number } } = {};
          const monthsInterval = eachMonthOfInterval({ start: startDate, end: endDate });

          monthsInterval.forEach(monthStart => {
              const monthKey = format(monthStart, "MMM ''yy");
              monthlyData[monthKey] = { income: 0, expenses: 0 };
          });
          
          // Process Other Income
          incomesSnap.docs.forEach(doc => {
            const income = doc.data() as SchoolIncome;
            const incomeDate = parseAppTimestamp(income.date);
            if (incomeDate && incomeDate >= startDate && incomeDate <= endDate) {
                const monthKey = format(incomeDate, "MMM ''yy");
                if (monthlyData[monthKey]) {
                    monthlyData[monthKey].income += income.amount;
                }
            }
          });

          // Process Fee Payments (Credit transactions)
          feeTransactionsSnap.docs.forEach(doc => {
            const payment = doc.data() as FeeTransaction;
            if(payment.paymentMethod !== 'Bursary/Scholarship'){
                const paymentDate = parseAppTimestamp(payment.transactionDate);
                if (paymentDate && paymentDate >= startDate && paymentDate <= endDate) {
                    const monthKey = format(paymentDate, "MMM ''yy");
                    if (monthlyData[monthKey]) {
                        monthlyData[monthKey].income += payment.amount;
                    }
                }
            }
          });

          // Process Expenses
          expensesSnap.docs.forEach(doc => {
            const expense = doc.data() as SchoolExpense;
             const expenseDate = parseAppTimestamp(expense.date);
            if (expenseDate && expenseDate >= startDate && expenseDate <= endDate) {
                const monthKey = format(expenseDate, "MMM ''yy");
                if (monthlyData[monthKey]) {
                    monthlyData[monthKey].expenses += expense.amount;
                }
            }
          });
          
          const chartData = Object.keys(monthlyData).map(month => ({
            name: month,
            "Total Income": monthlyData[month].income,
            "Total Expenses": monthlyData[month].expenses,
          }));

          setFinancialTrendData(chartData);

        } else {
          router.push('/school/auth');
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [schoolId, user, authLoading, router]);

  if (authLoading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Active Students" value={stats.students} icon={Users} color="bg-blue-500" />
        <StatCard title="Teachers" value={stats.teachers} icon={Briefcase} color="bg-orange-500" />
        <StatCard title="Open Tickets" value={stats.openTickets} icon={TicketIcon} color="bg-green-500" />
        <StatCard title="Total Classes" value={stats.classes} icon={SchoolIcon} color="bg-yellow-500" />
        <StatCard title="Outstanding Fees" value={`UGX ${stats.outstandingFees.toLocaleString()}`} icon={DollarSign} color="bg-purple-500" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center">
                <TrendingUp className="mr-2 text-primary" />
                Financial Overview (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsLineChart data={financialTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} tickMargin={5} />
                <YAxis fontSize={12} tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(value as number)} />
                <Tooltip formatter={(value) => `UGX ${Number(value).toLocaleString()}`} />
                <Legend wrapperStyle={{fontSize: "12px"}}/>
                <Line type="monotone" dataKey="Total Income" stroke="#16a34a" name="Total Income" activeDot={{ r: 6 }}/>
                <Line type="monotone" dataKey="Total Expenses" stroke="#dc2626" name="Total Expenses" activeDot={{ r: 6 }}/>
              </RechartsLineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center"><CalendarIcon className="mr-2 text-primary" /> Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length > 0 ? (
                <ul className="space-y-3">
                    {upcomingEvents.map(event => (
                        <li key={event.id} className="flex items-start gap-3">
                            <div className="flex flex-col items-center justify-center bg-muted/50 p-2 rounded-md w-16">
                                <span className="text-sm font-bold text-primary">{parseAppTimestamp(event.date) ? format(parseAppTimestamp(event.date)!, 'MMM') : ''}</span>
                                <span className="text-2xl font-bold">{parseAppTimestamp(event.date) ? format(parseAppTimestamp(event.date)!, 'd') : ''}</span>
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-sm line-clamp-1">{event.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-muted-foreground text-sm text-center py-10">No upcoming events scheduled.</p>
            )}
          </CardContent>
           <CardFooter>
                <Button variant="outline" size="sm" asChild>
                    <Link href={`/school/dashboard/${schoolId}/calendar`}>View Full Calendar</Link>
                </Button>
            </CardFooter>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 gap-6">
         <Card className="shadow-md">
           <CardHeader>
                <CardTitle className="flex items-center"><TicketIcon className="mr-2 text-primary" /> Recent Open Tickets</CardTitle>
            </CardHeader>
           <CardContent>
              {openTickets.length > 0 ? (
                <ul className="space-y-3">
                    {openTickets.map(ticket => (
                         <li key={ticket.id} className="flex justify-between items-center p-2 hover:bg-muted/50 rounded-md">
                            <div>
                                <p className="font-semibold text-sm">{ticket.subject}</p>
                                <p className="text-xs text-muted-foreground">{ticket.submittedBy?.name || 'N/A'} &bull; {parseAppTimestamp(ticket.createdAt) ? format(parseAppTimestamp(ticket.createdAt)!, 'PP') : ''}</p>
                            </div>
                             <Button variant="ghost" size="sm" asChild>
                                <Link href={`/school/dashboard/${schoolId}/tickets`}>View</Link>
                             </Button>
                         </li>
                    ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-10">No open tickets.</p>
              )}
           </CardContent>
             <CardFooter>
                <Button variant="outline" size="sm" asChild>
                    <Link href={`/school/dashboard/${schoolId}/tickets`}>View All Tickets</Link>
                </Button>
            </CardFooter>
        </Card>
      </div>
    </div>
  );
}
