/*
 * QMSortAlgorithm.java
 * Patrick Morin takes no responsibility for anything. So there.
 *
 */
import java.util.Random;

/**
 * A Randomized Sorting demonstration algorithm. In case you haven't 
 * noticed, this is a good example of a bad use of randomization.  
 *
 * QMSortAlgorithm.java
 *
 * @author Patrick Morin
 */

class QMSortAlgorithm extends SortAlgorithm {
  void sort(int a[]) throws Exception {
    Random rand = new Random();
    boolean change;

    do {
      change = false;
      // Do some random comparison exchange operations
      for (int i = 0; i < a.length/4; i++) {
	int j = rand.nextInt() % a.length;
	j = (j < 0) ? -j : j;
	int k = rand.nextInt() % a.length;
	k = (k < 0) ? -k : k;
	if((a[j] < a[k]) && (j > k)) {
	  int T = a[j];
	  a[j] = a[k];
	  a[k] = T;
	  i = 0;
	}
	compex(j,k);
	pause();
      }
      // Check if it's sorted
      for (int j = 0; !change && j < a.length-1; j++) {
	if (a[j] > a[j+1]) {
	  change = true;
	}
	compex(j, j+1);
	pause();
      } 
    } while(change);
  }
}






