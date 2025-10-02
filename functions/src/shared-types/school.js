"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const z = __importStar(require("zod")); // Import z for schema usage if needed here later
const generalFinanceSettingsSchema = z.object({
    currency: z.literal('UGX').optional(),
    acceptsMobileMoney: z.boolean().optional(),
    preferredPaymentProvider: z.string().optional(),
    preferredPaymentProviderOther: z.string().optional(),
    feeStructureFile: z.instanceof(File).optional().nullable(),
    bankAccountInfo: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.preferredPaymentProvider === "Other" && !data.preferredPaymentProviderOther?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specify payment provider", path: ["preferredPaymentProviderOther"] });
    }
});
const academicSettingsFormSchema = z.object({
    currentAcademicYearId: z.string().optional().nullable(),
    currentTerm: z.string().max(50, "Term name too long").optional().nullable(),
    termStructure: z.string().optional().nullable(),
    timezone: z.string().optional().nullable(),
});
const basicSchoolInfoSchema = z.object({
    name: z.string().min(3, "School name must be at least 3 characters").max(100),
    schoolType: z.string().min(1, "School type is required"),
    schoolTypeOther: z.string().optional(),
    ownership: z.string().min(1, "Ownership is required"),
    ownershipOther: z.string().optional(),
    motto: z.string().max(150).optional(),
    yearEstablished: z.preprocess((val) => (val ? parseInt(String(val), 10) : undefined), z.number().int().min(1800).max(new Date().getFullYear() + 5).optional().nullable()),
    level: z.string().min(1, "School level is required"),
    levelOther: z.string().optional(),
    curriculum: z.string().optional(),
    gradingSystem: z.string().optional(), // From settings page
    registrationNumber: z.string().optional(),
    unebCentreNumber: z.string().optional(),
    upiNumber: z.string().optional(),
    badgeImage: z.any().optional().nullable(), // File or string (URL if already uploaded)
    description: z.string().max(2000).optional(),
}).superRefine((data, ctx) => {
    if (data.schoolType === "Other" && !data.schoolTypeOther?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specify school type", path: ["schoolTypeOther"] });
    }
    if (data.ownership === "Other" && !data.ownershipOther?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specify ownership", path: ["ownershipOther"] });
    }
    if (data.level === "Other" && !data.levelOther?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specify school level", path: ["levelOther"] });
    }
});
//# sourceMappingURL=school.js.map