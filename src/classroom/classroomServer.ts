import "dotenv/config";
import { createClassroomSession, getClassroomInsights, getClassroomLessons, getClassroomSession, getRecentClassroomSessions } from "./classroomDb.js";
import { sendClassroomMessage } from "./classroom.js";
import { createClassroomApp } from "./classroomHttp.js";
import { failureReport } from "./runtimeSafety.js";

const port = Number(process.env.PORT ?? process.env.CLASSROOM_PORT ?? "3010");
const classroomKey = process.env.CLASSROOM_KEY;
if (!classroomKey) throw new Error("CLASSROOM_KEY is missing. Configure it securely before starting Classroom.");
const app = createClassroomApp({
  key: classroomKey,
  sessions: getRecentClassroomSessions,
  create: title => createClassroomSession({ title, mode: "TEACH" }),
  session: getClassroomSession,
  send: sendClassroomMessage,
  lessons: getClassroomLessons,
  insights: getClassroomInsights,
});
app.listen({ host: "0.0.0.0", port }).then(() => {
  console.log(`Mush Mush Classroom running on 0.0.0.0:${port}`);
}).catch(error => {
  failureReport(error, "http.listen");
  process.exitCode = 1;
});
