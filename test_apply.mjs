
import { notDeepEqual } from 'assert';

async function testApply() {
    try {
        // 1. Fetch valid job ID
        const jobsRes = await fetch('http://localhost:3000/api/jobs');
        const jobsData = await jobsRes.json();

        if (!jobsData.data || jobsData.data.length === 0) {
            console.log('No published jobs found. Cannot test apply flow properly.');
            // Proceed with dummy ID to confirm 400 "Job not found"
            return;
        }

        // We can proceed even if no jobs, I guess, but better to have one.
        // Assuming there is at least one job if the user is clicking "Apply".

        const jobId = jobsData.data[0].id;
        const jobTitle = jobsData.data[0].title;
        console.log(`Using Job ID: ${jobId}, Title: ${jobTitle}`);

        // 2. Submit application
        const formData = new FormData();
        formData.append('jobId', jobId);
        formData.append('jobTitle', jobTitle);
        formData.append('name', 'Test User');
        formData.append('phone', '13812345678');
        formData.append('email', 'test@example.com');

        // Create a dummy PDF file (header for PDF)
        // %PDF-1.0 ...
        const pdfContent = '%PDF-1.0\n%\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n3 0 obj\n<</Type/Page/MediaBox[0 0 3 3]>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer\n<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF';

        const file = new File([pdfContent], 'resume.pdf', { type: 'application/pdf' });
        formData.append('resume', file);

        const res = await fetch('http://localhost:3000/api/careers/apply', {
            method: 'POST',
            body: formData
        });

        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Body:', text);

    } catch (err) {
        console.error('Fetch error:', err);
    }
}

testApply();
