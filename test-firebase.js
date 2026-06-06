import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB5XxQ6ymvnXV58cmbSzlmnTU-mkAzL1Us",
  authDomain: "bingokrs-251b2.firebaseapp.com",
  projectId: "bingokrs-251b2",
  storageBucket: "bingokrs-251b2.firebasestorage.app",
  messagingSenderId: "1061685532450",
  appId: "1:1061685532450:web:fcf3fcf53714b2aef3777b"
};

async function test() {
  console.log("Initializing Firebase...");
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  
  const docRef = doc(db, "partidas", "atual");
  
  try {
    console.log("Reading from Firestore...");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      console.log("Successfully read from Firestore! Game ID:", docSnap.data().gameId);
      console.log("Queue length:", docSnap.data().rodadasQueue?.length);
      console.log("Status:", docSnap.data().status);
      
      // Let's try to write a test property
      console.log("Testing write to Firestore...");
      const data = docSnap.data();
      data.testWriteTimestamp = Date.now();
      await setDoc(docRef, data);
      console.log("Successfully wrote to Firestore!");
    } else {
      console.log("Document does not exist.");
    }
  } catch (err) {
    console.error("Firebase connection error:", err);
  }
}

test();
