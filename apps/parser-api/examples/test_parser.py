"""Quick test of resume parser without a real PDF."""

from jobpilot.services.resume_parser import parse_resume_text

SAMPLE = """
Jane Doe
jane.doe@example.com | +1 (555) 123-4567
San Francisco, CA 94105
https://linkedin.com/in/janedoe | https://github.com/janedoe

SUMMARY
Backend engineer with 5 years of experience building APIs and data pipelines.

SKILLS
Python, FastAPI, PostgreSQL, Docker, AWS, REST APIs

EXPERIENCE
Software Engineer | Acme Corp | Remote
Mar 2021 - Present
Built internal tools and REST services for the platform team.

Junior Developer at StartupXYZ
Jun 2019 - Feb 2021
Maintained Django apps and CI pipelines.

EDUCATION
Vellore Institute of Technology Chennai, India
Bachelor of Technology
Computer Science
2019 - 2023

PROJECTS
Credit Score Analysis Tool
• Engineered a real-time credit scoring platform using Kafka and Spark,
enabling scalable, low-latency decisioning with predictive analytics.
• Developed REST APIs with OAuth-based authentication, ensuring secure access.
• Optimized performance using Redis caching and contributed to deployment and maintenance.
"""

VIT_SAMPLE = """
Jane Doe
jane@example.com

EDUCATION
Vellore Institute of Technology Chennai, India
Bachelor of Technology
Computer Science
2019 - 2023

PROJECTS
Credit Score Analysis Tool
• Engineered a real-time credit scoring platform using Kafka and Spark
• Developed REST APIs with OAuth-based authentication
"""

PDF_GLUED = """
Gaurav Pampana
gaurav@email.com

EDUCATION
Vellore Institute of Technology Chennai, India
Bachelor of Technology
Computer Science
2019 - 2023 Projects Credit Score Analysis Tool
• Engineered a real-time credit scoring platform using Kafka and Spark
• Developed REST APIs with OAuth-based authentication
"""

ONE_LINE_PER_ROW = """
EDUCATION
Vellore Institute of Technology Chennai, India
Bachelor of Technology
Projects
Credit Score Analysis Tool
• Engineered a real-time credit scoring platform
• Developed REST APIs with OAuth-based authentication
• Optimized performance using Redis caching
"""

BAJAJ_EXPERIENCE = """
Gaurav Pampana
gaurav@email.com

EXPERIENCE
Senior Software Developer
Bajaj Finance
Jan 2025 - Present
• Built and maintained backend services for lending platforms.

EDUCATION
Vellore Institute of Technology Chennai, India
Bachelor of Technology
Electronics and Communication Engineering
Jun 2023
"""

MULTI_EDU = """
John Smith
john.smith@example.com | (555) 123-4567

EDUCATION
Stanford University | Stanford, CA
Master of Science in Computer Science | 2021 - 2023 | GPA: 3.9/4.0
University of Texas | Austin, TX
Bachelor of Science in Mathematics | 2017 - 2021

EXPERIENCE
Acme Inc | Senior Data Analyst | New York, NY
Jan 2023 - Present
- Built dashboards for exec team.
"""

COMPANY_FIRST = """
Priya Sharma
priya.sharma@gmail.com

WORK EXPERIENCE
Infosys Limited
Software Developer (Full-time)
Aug 2020 - Mar 2024
• Developed microservices in Java.

TCS
Intern
Jan 2020 - Jul 2020
• Assisted QA automation.

EDUCATION
Anna University, Chennai
B.E. Computer Science, CGPA: 8.5
2016 - 2020
"""

PIPE_HEADERS = """
Venkata Gaurav Pampana
+91 7989832709 | pampanagaurav@gmail.com | LinkedIn

Work Experience
Senior Software Engineer | Jan 2025 - Present
Bajaj Finserv | Pune, India
• Engineered performance optimizations achieving sub-100 ms p98 latency.

Software Engineer | July 2023 - Dec 2024
Bajaj Finserv | Pune, India
• Designed and delivered a unified Partner Service API for co-lending.

Education
Vellore Institute of Technology | Chennai, India
Bachelor of Technology in Electronics and Communication Engineering | Jul 2019 - Jun 2023

Skills
Languages/Frameworks/Database: Java, Spring Boot, PostgreSQL, MySQL
DevOps: Docker, Kubernetes, CI/CD pipeline
"""

if __name__ == "__main__":
    for name, sample in [
        ("default", SAMPLE),
        ("vit", VIT_SAMPLE),
        ("pdf_glued", PDF_GLUED),
        ("one_per_row", ONE_LINE_PER_ROW),
        ("bajaj_experience", BAJAJ_EXPERIENCE),
        ("multi_edu", MULTI_EDU),
        ("company_first", COMPANY_FIRST),
        ("pipe_headers", PIPE_HEADERS),
    ]:
        result = parse_resume_text(sample)
        edu = result.extracted.education
        projects = result.extracted.metadata.get("projects", [])
        work = result.extracted.work_experience
        print(f"\n=== {name} ===")
        print(f"Education entries: {len(edu)}")
        for e in edu:
            print(f"  - school={e.school!r} degree={e.degree} field={e.field_of_study!r}")
        print(f"Projects: {len(projects)}")
        for p in projects:
            print(f"  - {p.get('title')}")
        print(f"Work experience: {len(work)}")
        for w in work:
            print(f"  - title={w.title!r} company={w.company!r} start={w.start_date}")
        assert len(edu) <= 2, f"{name}: too many education entries ({len(edu)})"
        if name != "default":
            assert len(edu) >= 1, f"{name}: expected at least 1 education entry"
        if name == "bajaj_experience":
            assert len(work) == 1, f"{name}: expected 1 work entry"
            assert work[0].title and "developer" in work[0].title.lower()
            assert work[0].company and "bajaj" in work[0].company.lower()
        if name == "multi_edu":
            assert len(edu) == 2, f"{name}: expected 2 education entries"
            assert edu[0].degree == "masters" and edu[1].degree == "bachelors"
            assert edu[0].gpa and "3.9" in edu[0].gpa
            assert len(work) == 1 and work[0].company and "acme" in work[0].company.lower()
        if name == "company_first":
            assert len(work) == 2, f"{name}: expected 2 work entries"
            assert work[0].company and "infosys" in work[0].company.lower()
            assert work[1].employment_type == "intern"
            assert edu[0].gpa == "8.5"
        if name == "pipe_headers":
            assert len(work) == 2, f"{name}: expected 2 work entries"
            assert all(w.company and "bajaj" in w.company.lower() for w in work)
            assert all(w.location and "pune" in w.location.lower() for w in work)
            assert work[0].is_current and not work[1].is_current
            skills = result.extracted.profile.skills
            assert "CI/CD pipeline" in skills, f"{name}: CI/CD split wrongly: {skills}"
            assert edu[0].field_of_study and "communication" in edu[0].field_of_study.lower()
    print("\nAll parser tests passed.")
